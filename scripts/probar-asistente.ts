/**
 * scripts/probar-asistente.ts — ¿ATERRIZÓ EL HILO DEL ASISTENTE, Y ENTRA SU CONTEXTO?
 *
 * El chat todavía no tiene pantalla (falta el turno y el panel), así que esto es lo que se puede
 * comprobar hoy — y una de las tres cosas NO la puede contestar ningún test:
 *
 *  1. **Las tablas están.** Que la migración haya corrido de verdad contra esta base.
 *  2. ⭐ **El contexto entra en el techo.** Los tests miden el código; esto mide el CONTEXTO REAL
 *     del cronograma más grande de la cartera. La decisión «el chat entiende la intención, el
 *     editor tiene el contexto» se apoya en que la forma del documento sea chica — y eso es una
 *     afirmación sobre los DATOS, no sobre el código. Si el cronograma de 11 fases se pasa de
 *     6.000 caracteres, el techo está mal puesto y hay que saberlo ahora, no en la factura.
 *  3. **El hilo va y vuelve** (solo con `--apply`): abrir, dos turnos, releer, borrar.
 *
 * Correr:
 *   npx tsx scripts/probar-asistente.ts                 ← solo lectura, no escribe nada
 *   $env:ALLOW_PROD_WRITE='1'; npx tsx scripts/probar-asistente.ts --apply   ← + ida y vuelta
 *
 * ⚠ El `--apply` escribe un hilo de prueba y LO BORRA al final. Va con el guard igual: la regla
 * del repo no admite excepciones por «es chiquito» (INV12).
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { resolverApply } from "./lib/guard";
import { contextoDeCronograma, contextoDeDocumento, TECHO_DEL_PREFIJO_CHARS } from "@/lib/asistente/contexto";
import { abrirHilo, agregarTurno, leerHilo, huellaDeContexto, hiloVivo } from "@/lib/asistente/hilo";
import { correrTurno } from "@/lib/asistente/turno";

const CORREO_DE_PRUEBA = "probar-asistente@smarteamcr.com";

async function main() {
  const apply = resolverApply();

  console.log("\n=== 1 · ¿ATERRIZÓ LA MIGRACIÓN? ===");
  try {
    const hilos = await prisma.hiloDeChat.count();
    const mensajes = await prisma.mensajeDeChat.count();
    console.log(`  ✅ Las dos tablas existen. HiloDeChat: ${hilos} · MensajeDeChat: ${mensajes}`);
  } catch (e) {
    console.log(`  ❌ Las tablas NO están (o el cliente de Prisma es viejo): ${(e as Error).message}`);
    console.log("     → correr el .sql, después `npx prisma generate`, y REINICIAR el dev server.");
    process.exit(1);
  }

  console.log("\n=== 2 · EL CONTEXTO REAL, CONTRA EL TECHO ===");
  console.log(`  Techo declarado: ${TECHO_DEL_PREFIJO_CHARS.toLocaleString("es")} caracteres\n`);

  /* Los cronogramas MÁS GRANDES de la cartera: si el techo aguanta el peor caso, aguanta. */
  const gordos = await prisma.projectTimeline.findMany({
    select: {
      projectId: true,
      project: { select: { name: true } },
      _count: { select: { phases: true } },
    },
    orderBy: { phases: { _count: "desc" } },
    take: 5,
  });

  let peor = 0;
  let peorNombre = "";
  for (const t of gordos) {
    const ctx = await contextoDeCronograma(t.projectId);
    const n = ctx.texto.length;
    if (n > peor) {
      peor = n;
      peorNombre = t.project.name;
    }
    const señal = n > TECHO_DEL_PREFIJO_CHARS ? "❌" : n > TECHO_DEL_PREFIJO_CHARS * 0.8 ? "⚠ " : "✅";
    console.log(
      `  ${señal} ${String(n).padStart(5)} chars · ${String(t._count.phases).padStart(2)} fases · ` +
        `cierre ${ctx.cierreActual ?? "(sin ancla)"} · ${t.project.name}`,
    );
  }

  /* Y un documento con muchas secciones, que es el otro camino. */
  const canvasGordo = await prisma.projectCanvas.findFirst({
    where: { projectId: { not: null }, slug: { not: null } },
    select: {
      projectId: true,
      slug: true,
      name: true,
      _count: { select: { canvasSections: true } },
    },
    orderBy: { canvasSections: { _count: "desc" } },
  });
  if (canvasGordo?.projectId && canvasGordo.slug) {
    const ctx = await contextoDeDocumento({ projectId: canvasGordo.projectId }, canvasGordo.slug);
    const n = ctx.texto.length;
    const señal = n > TECHO_DEL_PREFIJO_CHARS ? "❌" : "✅";
    console.log(
      `  ${señal} ${String(n).padStart(5)} chars · ${canvasGordo._count.canvasSections} secciones · ` +
        `documento «${canvasGordo.name}»`,
    );
    if (n > peor) {
      peor = n;
      peorNombre = canvasGordo.name;
    }
  }

  console.log(
    `\n  → El peor caso de la cartera son ${peor.toLocaleString("es")} caracteres (${peorNombre}), ` +
      `un ${Math.round((peor / TECHO_DEL_PREFIJO_CHARS) * 100)} % del techo.`,
  );

  console.log("\n=== 3 · EL CONTEXTO, PARA LEERLO CON LOS OJOS ===");
  console.log("  (es literalmente lo que va a ver el modelo en cada turno)\n");
  if (gordos[0]) {
    const ctx = await contextoDeCronograma(gordos[0].projectId);
    console.log(ctx.texto.split("\n").map((l) => "  │ " + l).join("\n"));
  }

  if (!apply) {
    console.log("\n=== 4 · LA IDA Y VUELTA DEL HILO ===");
    console.log("  (omitida: corré con --apply para probarla — escribe un hilo y lo borra)\n");
    await prisma.$disconnect();
    return;
  }

  console.log("\n=== 4 · LA IDA Y VUELTA DEL HILO ===");
  const projectId = gordos[0]?.projectId;
  if (!projectId) {
    console.log("  (no hay ningún proyecto con cronograma para probar)");
    await prisma.$disconnect();
    return;
  }

  const pedido = {
    dueno: { projectId },
    pieza: "timeline",
    usuarioEmail: CORREO_DE_PRUEBA,
    modelo: "claude-sonnet-5",
  };

  const hilo = await abrirHilo(pedido);
  console.log(`  ✅ Hilo abierto: ${hilo.id} · modelo ${hilo.modelo} · ${hilo.turnos.length} turnos`);

  const sha = huellaDeContexto((await contextoDeCronograma(projectId)).texto);
  await agregarTurno(hilo.id, {
    rol: "CSE",
    contenido: "¿Se puede alargar la fase de Setup una semana?",
    shaDeContexto: sha,
  });
  await agregarTurno(hilo.id, {
    rol: "ASISTENTE",
    contenido: "Sí. Eso corre la fecha de cierre una semana. ¿Lo hago?",
    shaDeContexto: sha,
  });
  console.log(`  ✅ Dos turnos escritos, con la huella del contexto: ${sha}`);

  const releido = await leerHilo(hilo.id, { projectId });
  console.log(
    `  ✅ Releído desde la base: ${releido?.turnos.length} turnos, en orden: ` +
      `${releido?.turnos.map((t) => t.rol).join(" → ")}`,
  );

  /* El anti-IDOR: el mismo id de hilo, anclado a OTRO proyecto, no devuelve nada. */
  const otro = gordos.find((g) => g.projectId !== projectId)?.projectId;
  if (otro) {
    const fuga = await leerHilo(hilo.id, { projectId: otro });
    console.log(
      fuga === null
        ? "  ✅ El id de un hilo NO abre la conversación de otro proyecto (anti-IDOR)"
        : "  ❌ FUGA: el hilo se leyó desde otro proyecto",
    );
  }

  /* La regla del modelo fijo: pedirlo con otro modelo abre un hilo NUEVO. */
  const conOtroModelo = await abrirHilo({ ...pedido, modelo: "claude-haiku-4-5" });
  console.log(
    conOtroModelo.id !== hilo.id
      ? "  ✅ Pedirlo con otro modelo abrió un hilo NUEVO (la caché de prefijo no se invalida)"
      : "  ❌ Reusó el hilo con otro modelo: la caché de prompt se invalida en silencio",
  );

  /* ── 5 · LA CONVERSACIÓN DE VERDAD ────────────────────────────────────────────────────────
     Lo único que prueba que el turno FUNCIONA: una llamada real al modelo, con el contexto real,
     mirando si la herramienta del acuerdo dispara cuando corresponde. Cuesta ~1 centavo y es la
     diferencia entre «compila» y «anda». Va detrás de su propio flag porque gasta modelo. */
  if (process.argv.includes("--conversar")) {
    console.log("\n=== 5 · UNA CONVERSACIÓN DE VERDAD (gasta modelo) ===");
    const h = await abrirHilo(pedido);

    const preguntas = [
      "¿Qué pasa si alargo la fase de Integraciones dos semanas?",
      "Dale, hacelo.",
    ];
    let vivo = h;
    for (const q of preguntas) {
      console.log(`\n  CSE ▸ ${q}`);
      const r = await correrTurno(vivo, q);
      console.log(r.respuesta.split("\n").map((l) => "  IA  │ " + l).join("\n"));
      if (r.acuerdo) {
        console.log("\n  ⭐ LA HERRAMIENTA DISPARÓ — hay acuerdo:");
        console.log(`     resumen:     ${r.acuerdo.resumen}`);
        console.log(`     instrucción: ${r.acuerdo.instruccion}`);
      }
      vivo = (await leerHilo(h.id, { projectId }))!;
    }
    console.log(`\n  El hilo quedó con ${vivo.turnos.length} turnos guardados.`);
  }

  console.log("\n  Limpiando los hilos de prueba…");
  const borrados = await prisma.hiloDeChat.deleteMany({
    where: { usuarioEmail: CORREO_DE_PRUEBA },
  });
  console.log(`  ✅ ${borrados.count} hilos de prueba borrados (los mensajes caen por cascade).`);

  const queda = await hiloVivo({ dueno: { projectId }, pieza: "timeline", usuarioEmail: CORREO_DE_PRUEBA });
  console.log(queda === null ? "  ✅ No quedó nada." : "  ❌ Quedó un hilo de prueba sin borrar.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
