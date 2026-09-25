/**
 * scripts/probar-asistente.ts — ¿ATERRIZÓ EL HILO DEL ASISTENTE, Y ENTRA SU CONTEXTO?
 *
 * El chat ya tiene su turno y su panel; esto comprueba lo que ningún test puede contestar, porque
 * es una afirmación sobre los DATOS de esta base y no sobre el código:
 *
 *  1. **Las tablas están.** Que la migración haya corrido de verdad contra esta base.
 *  2. ⭐ **El contexto entra en el techo.** Los tests miden el código; esto mide el CONTEXTO REAL
 *     de los cronogramas más grandes de la cartera, contra `TECHO_DEL_PREFIJO_CHARS` (13.000 desde
 *     que entraron las tareas). La decisión «el chat entiende la intención, el editor tiene el
 *     contexto» se apoya en que la forma del documento sea chica: si el más grande se pasa, hay que
 *     saberlo ahora, no en la factura.
 *  2b. **Con una propuesta abierta** (E3 P4, solo lectura): las propuestas nuevas que hay de verdad, y
 *     una propuesta grande de prueba (armada en memoria, nunca guardada) sobre los 5 cronogramas con
 *     más tareas: el índice de la barra tiene que salir entero, entre o no en el techo.
 *  3. **El hilo va y vuelve** (solo con `--apply`): abrir, dos turnos, releer, borrar.
 *
 * Correr:
 *   npx tsx scripts/probar-asistente.ts                 ← solo lectura, no escribe nada
 *   $env:ALLOW_PROD_WRITE='1'; npx tsx scripts/probar-asistente.ts --apply   ← + ida y vuelta
 *
 * ⚠ El `--apply` escribe un hilo de prueba y LO BORRA al final. Va con el guard igual: la regla
 * del repo no admite excepciones por «es chiquito» (INV12). La sección 2b no escribe nada nunca.
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolverApply } from "./lib/guard";
import {
  contextoDeCronograma,
  contextoDeDocumento,
  lineaParaRehacerTodo,
  TECHO_DEL_PREFIJO_CHARS,
} from "@/lib/asistente/contexto";
import { armarContextoConPropuesta } from "@/lib/asistente/contexto-del-cronograma";
import { abrirHilo, agregarTurno, leerHilo, huellaDeContexto, hiloVivo } from "@/lib/asistente/hilo";
import { correrTurno, promptDelAsistente, TOOL_ACUERDO } from "@/lib/asistente/turno";
import { SELECT_DE_FASES_CON_TAREAS, vivoDeLaBase } from "@/lib/timeline/borrador-del-detalle";
import { propuestaParaElChat } from "@/lib/timeline/propuesta-para-el-chat";
import {
  claveDeCampo,
  claveDeTareaNueva,
  claveDeTareaQueSeVa,
  FORMATO_BORRADOR,
  fotoDeTarea,
  type Borrador,
  type Cambio,
  type FormaDeFase,
  type ResumenDelBorrador,
  type Vivo,
} from "@/lib/timeline/borrador";

const CORREO_DE_PRUEBA = "probar-asistente@smarteamcr.com";

/** ✅ entra holgado · ⚠ pasa el 80 % del techo · ❌ pasa el techo. */
function señalDe(n: number): string {
  return n > TECHO_DEL_PREFIJO_CHARS ? "❌" : n > TECHO_DEL_PREFIJO_CHARS * 0.8 ? "⚠ " : "✅";
}

/**
 * ¿El índice de la barra salió entero? Los renglones numerados de «LOS CAMBIOS» tienen que ser
 * exactamente 1..(cambios de fases + grupos de tareas), cada uno una vez.
 */
function indiceEntero(texto: string, r: Pick<ResumenDelBorrador, "items" | "grupos">): boolean {
  const desde = texto.indexOf("LOS CAMBIOS CONTRA EL CRONOGRAMA DE HOY");
  if (desde < 0) return false;
  const hasta = texto.indexOf("PARA REHACER TODO", desde);
  const numeros = texto
    .slice(desde, hasta < 0 ? undefined : hasta)
    .split("\n")
    .filter((l) => /^\d+\. /.test(l))
    .map((l) => Number(l.slice(0, l.indexOf("."))));
  const total = r.items.length + r.grupos.length;
  return numeros.length === total && numeros.every((n, i) => n === i + 1);
}

/**
 * Una propuesta GRANDE de prueba sobre un cronograma real, solo en memoria (nunca se guarda): lo que
 * dejaría un «Regenerar todo» que cambia casi todo. Por fase, +1 semana y un renombre; 2 fases nuevas
 * de 60 caracteres; el orden invertido y otro arranque; una que se va por cada tarea pendiente de la IA;
 * 1,3 nuevas por cada una que se va, con títulos de 90 caracteres; una nota de fase de 1.500 y 3
 * desmarcados.
 */
function borradorDePrueba(vivo: Vivo): Borrador {
  const ids = vivo.fases.map((f) => f.id);
  const cambios: Cambio[] = [];
  const armadas: Record<string, FormaDeFase> = {};
  const hoy = vivo.ancla ? vivo.ancla.slice(0, 10) : null;
  const otroArranque = new Date(Date.parse(`${hoy ?? "2026-10-05"}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  cambios.push({ tipo: "ancla", clave: "ancla", desde: hoy, a: otroArranque });
  cambios.push({ tipo: "orden", clave: "orden", desde: ids, a: [...ids].reverse(), motivos: ["Así lo pidió el cliente."] });
  for (const f of vivo.fases) {
    const nombre = `${f.name} (revisada)`;
    const motivo = "En la última reunión el cliente pidió más tiempo para validar con su equipo.";
    cambios.push({ tipo: "fase-cambia", clave: claveDeCampo(f.id, "durationWeeks"), faseId: f.id, fase: f.name, campo: "durationWeeks", desde: f.durationWeeks, a: f.durationWeeks + 1, motivo });
    cambios.push({ tipo: "fase-cambia", clave: claveDeCampo(f.id, "name"), faseId: f.id, fase: f.name, campo: "name", desde: f.name, a: nombre, motivo });
    armadas[f.id] = { nombre, semanas: f.durationWeeks + 1 };
  }
  if (vivo.fases[0]) {
    const f = vivo.fases[0];
    const nota = "El ERP expone la API de pedidos recién en noviembre; hasta entonces se integra por archivo. ".repeat(20).slice(0, 1_500);
    cambios.push({ tipo: "fase-cambia", clave: claveDeCampo(f.id, "notes"), faseId: f.id, fase: f.name, campo: "notes", desde: f.notes, a: nota });
  }
  const nuevasFases = [0, 1].map((i) => `n:0000000${i}`);
  nuevasFases.forEach((clave, i) => {
    const name = `Fase nueva de prueba ${i + 1}: validación con el equipo del cliente y ajustes`.slice(0, 60);
    cambios.push({
      tipo: "fase-nueva",
      clave,
      fase: { name, durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType: null },
      despuesDe: i === 0 ? (ids[ids.length - 1] ?? null) : nuevasFases[0],
    });
    armadas[clave] = { nombre: name, semanas: 2 };
  });
  const seVan = vivo.fases.flatMap((f) =>
    (f.tareas ?? []).filter((t) => t.status === "PENDING" && t.source === "AGENT").map((t) => ({ f, t })),
  );
  for (const { f, t } of seVan) {
    cambios.push({ tipo: "tarea-se-va", clave: claveDeTareaQueSeVa(t.id), tareaId: t.id, faseId: f.id, desde: fotoDeTarea(t) });
  }
  const destinos = [...ids, ...nuevasFases];
  const cuantas = Math.round(seVan.length * 1.3);
  for (let k = 0; k < cuantas && destinos.length > 0; k++) {
    const fase = destinos[k % destinos.length];
    const title = `${k + 1}. Configurar y validar con el cliente la integración del módulo de licitaciones públicas`
      .padEnd(90, ".")
      .slice(0, 90);
    cambios.push({
      tipo: "tarea-nueva",
      clave: claveDeTareaNueva(),
      fase,
      tarea: { title, weekIndex: k % armadas[fase].semanas, notes: null, party: "SMARTEAM", type: "TASK", needsValidation: false, motivoPorValidar: null, fuga: null },
    });
  }
  const primeraNueva = cambios.find((c) => c.tipo === "tarea-nueva");
  const excluidos = [
    ...(ids[0] ? [claveDeCampo(ids[0], "name")] : []),
    ...(seVan[0] ? [claveDeTareaQueSeVa(seVan[0].t.id)] : []),
    ...(primeraNueva ? [primeraNueva.clave] : []),
  ];
  return {
    formato: FORMATO_BORRADOR,
    version: 1,
    origen: "contexto",
    observaciones: [],
    cambios,
    pedido: "regenerar",
    tareas: { corrida: "prueba", listas: true },
    tareasArmadasPara: armadas,
    excluidos,
  };
}

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

  console.log("\n=== 2b · CON UNA PROPUESTA ABIERTA (solo lectura) ===");
  /* 1 · Las propuestas nuevas (`borrador-v1`) que hay de verdad, con el contexto que ve el chat. */
  const abiertas = await prisma.projectTimeline.findMany({
    where: { pendingProposal: { not: Prisma.DbNull } },
    select: { projectId: true, project: { select: { name: true } } },
  });
  let reales = 0;
  for (const t of abiertas) {
    const ctx = await contextoDeCronograma(t.projectId);
    const p = ctx.propuesta;
    if (!p || p.version === null) continue; // el formato viejo: el chat usa el contexto de hoy
    reales++;
    const n = ctx.texto.length;
    const indice = p.recorte && p.resumen ? (indiceEntero(ctx.texto, p.resumen) ? "índice entero" : "❌ EL ÍNDICE NO SALIÓ ENTERO") : null;
    console.log(
      `  ${señalDe(n)} ${String(n).padStart(5)} chars · ${p.modo}${p.porQue ? ` (${p.porQue})` : ""} · ` +
        (p.recorte ? `nivel ${p.recorte.nivel} · ${JSON.stringify(p.recorte.medidas)} · ${indice} · ` : "contexto de hoy · ") +
        t.project.name,
    );
  }
  if (reales === 0) console.log("  (no hay ninguna propuesta nueva abierta: puede pasar hasta desplegar E2a)");

  /* 2 · Una propuesta GRANDE de prueba (en memoria) sobre los 5 cronogramas con más tareas. */
  console.log("\n  Propuesta de prueba sobre los 5 cronogramas con más tareas (se espera Wherex):");
  const conTareas = await prisma.projectTimeline.findMany({
    select: { projectId: true, phases: { select: { _count: { select: { tasks: true } } } } },
  });
  const masTareas = conTareas
    .map((t) => ({ projectId: t.projectId, tareas: t.phases.reduce((n, f) => n + f._count.tasks, 0) }))
    .sort((a, b) => b.tareas - a.tareas)
    .slice(0, 5);
  const paraRehacerTodo = lineaParaRehacerTodo({ conDetalleDeLaIA: true, publicadoAlgunaVez: true, cambiosDeFasesSinDecidir: true });
  for (const { projectId } of masTareas) {
    const tl = await prisma.projectTimeline.findUnique({
      where: { projectId },
      select: {
        anchorStartDate: true,
        closeDateOverride: true,
        project: { select: { name: true, client: { select: { name: true } } } },
        phases: SELECT_DE_FASES_CON_TAREAS,
      },
    });
    if (!tl) continue;
    const vivo = vivoDeLaBase(tl.anchorStartDate, tl.phases);
    const borrador = borradorDePrueba(vivo);
    const p = propuestaParaElChat({
      guardado: JSON.parse(JSON.stringify(borrador)),
      token: "prueba",
      vivo,
      tareas: { estado: "listas", fase: null, motivo: null },
    });
    if (!p.resumen) continue;
    const c = armarContextoConPropuesta(
      {
        proyecto: tl.project.name,
        cliente: tl.project.client.name,
        propuesta: { ...p, resumen: p.resumen },
        cierreFijado: tl.closeDateOverride ? tl.closeDateOverride.toISOString().slice(0, 10) : null,
        paraRehacerTodo,
        puedeEditar: true,
      },
      { techo: TECHO_DEL_PREFIJO_CHARS },
    );
    const vivas = vivo.fases.reduce((n, f) => n + (f.tareas?.length ?? 0), 0);
    const seVan = borrador.cambios.filter((x) => x.tipo === "tarea-se-va").length;
    const nuevas = borrador.cambios.filter((x) => x.tipo === "tarea-nueva").length;
    const indice = indiceEntero(c.texto, p.resumen) ? "índice entero" : "❌ EL ÍNDICE NO SALIÓ ENTERO";
    console.log(
      `  ${señalDe(c.texto.length)} ${String(c.texto.length).padStart(5)} chars · nivel ${c.nivel}${c.excede ? " (pasa el techo)" : ""} · ` +
        `${indice} · ${vivo.fases.length} fases, ${vivas} tareas, ${seVan} se van, ${nuevas} nuevas · ` +
        `${JSON.stringify(c.medidas)} · ${tl.project.name}`,
    );
  }

  /* 3 · Lo fijo de cada turno del cronograma: el prompt y la herramienta (se cachean entre proyectos). */
  const prompt = promptDelAsistente(true);
  const herramienta = JSON.stringify(TOOL_ACUERDO);
  console.log(
    `\n  Prompt del cronograma ${prompt.length.toLocaleString("es")} + herramienta ${herramienta.length.toLocaleString("es")} = ` +
      `${(prompt.length + herramienta.length).toLocaleString("es")} caracteres (fijos, fuera del techo del contexto).`,
  );

  console.log("\n=== 3 · EL CONTEXTO, PARA LEERLO CON LOS OJOS ===");
  console.log("  (es literalmente lo que va a ver el modelo en cada turno)\n");
  if (gordos[0]) {
    const ctx = await contextoDeCronograma(gordos[0].projectId);
    console.log(ctx.texto.split("\n").map((l) => "  │ " + l).join("\n"));
  }

  if (!apply) {
    console.log("\n=== 4 · LA IDA Y VUELTA DEL HILO ===");
    console.log("  (omitida: corre con --apply para probarla — escribe un hilo y lo borra)\n");
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
      "Sí, hazlo.",
    ];
    let vivo = h;
    for (const q of preguntas) {
      console.log(`\n  CSE ▸ ${q}`);
      const r = await correrTurno(vivo, q);
      console.log(r.respuesta.split("\n").map((l) => "  IA  │ " + l).join("\n"));
      if (r.acuerdo) {
        console.log("\n  ⭐ LA HERRAMIENTA DISPARÓ — hay acuerdo:");
        console.log(`     resumen: ${r.acuerdo.resumen}`);
        /* Las líneas que el CSE aprueba (la instrucción de texto es de los hilos de antes del 2026-08-20). */
        for (const l of r.acuerdo.lineas ?? []) console.log(`     · ${l}`);
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
