/**
 * scripts/encolar-lecturas-pendientes.ts — deja en la cola de la LECTURA DE SEGUIMIENTO las reuniones que se quedaron
 * afuera (memoria de la cuenta, etapa 2; docs/RUNBOOK.md «La lectura de cada reunión»), y con `--recuperacion` lee lo
 * atrasado por lote (T2).
 *
 * Para qué sirve:
 *   · el día del deploy: las reuniones frescas que se enriquecieron ANTES de que existiera la cola no tienen fila, e
 *     INV44 las reclama (medido el 2026-10-10: 6 de 92 sin minuta). Sin esto, INV44 nace en rojo;
 *   · después: una reunión puntual que quedó afuera (`--sesion <id>`, sin el corte de 14 días), o las que quedaron en
 *     `error` tras tres intentos (`--tambien-errores`).
 * La regla de qué entra es la de la cola (lib/lecturas/reglas.ts, `motivoParaNoEncolar`): de un cliente o un
 * prospecto, no de puertas adentro, ya ocurrida, fresca (salvo `--sesion`) y con texto (transcripción o, T2, solo notas
 * de Gemini: lib/sessions/tiene-texto.ts). Lo encolado lo lee el job `seguimiento-reuniones`, de a 2 por tick y contra
 * el presupuesto automático.
 *
 * ── EL MODO DE RECUPERACIÓN (`--recuperacion`, T2, 2026-10-24) ──────────────────────────────────────────────
 * Las reuniones de MÁS de 14 días, con texto y sin minuta, de las empresas activas (`--todas` para todas): minuta y
 * temas, sin propuestas de Tarea ni pedidos fuera de alcance, por la API de lotes (mitad de precio), fuera del
 * presupuesto automático: el gasto se anota a nombre de quien la corre y cuenta en el presupuesto HUMANO del día (el que comparte todo el equipo, US$20) (`--por <correo>`). Ver lib/lecturas/recuperacion.ts.
 * Primero en seco con 10, se mira la salida (y el costo estimado del lote), y después `--apply`. Tope: 100 por corrida.
 * Vuelta atrás: `LECTURA_DE_RECUPERACION=0` en el .env del servidor (lo que espera en el lote no se manda).
 *
 * En seco por defecto (la conexión nace de solo lectura): lista lo que encolaría y por qué no encola el resto. Para
 * escribir, `--apply` con ALLOW_PROD_WRITE=1 (el guard respalda la tabla que escribe antes).
 *
 * Uso:
 *   npx tsx scripts/encolar-lecturas-pendientes.ts                         # en seco: las de los últimos 14 días
 *   npx tsx scripts/encolar-lecturas-pendientes.ts --tambien-errores
 *   npx tsx scripts/encolar-lecturas-pendientes.ts --sesion <id>          # una reunión puntual (sin el corte de 14 días)
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/encolar-lecturas-pendientes.ts --apply
 *
 *   npx tsx scripts/encolar-lecturas-pendientes.ts --recuperacion --desde 2026-07-26 --limite 10 [--todas]
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/encolar-lecturas-pendientes.ts --recuperacion --desde 2026-07-26 --limite 10 --por elias@smarteamcr.com --desplegado --apply
 *
 * ⚠ `--apply` de la recuperación SOLO después del deploy que la trae (por eso pide `--desplegado`): con el código viejo,
 * el job de lotes de producción mandaría los pedidos contra el presupuesto automático y, al volver, no sabría qué hacer
 * con ellos (quedarían en error, pagados).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { createScriptDb } from "./lib/db";
import { describirDestino, resolverApply } from "./lib/guard";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

const apply = process.argv.includes("--apply");
if (!apply) {
  /* ⛔ En seco ni por error: la conexión nace de solo lectura (pg lee PGOPTIONS al abrir cada conexión). */
  process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");
}

const ESTADOS_EN_CURSO = ["en_espera", "leyendo"];

async function main() {
  if (process.argv.includes("--recuperacion")) return recuperacion();
  const escribir = resolverApply({ tablas: ["LecturaDeReunion"] });
  const sola = arg("--sesion");
  const conErrores = process.argv.includes("--tambien-errores");
  const max = Math.max(1, Number(arg("--max") ?? 100));
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (${escribir ? "ESCRIBE" : "en seco, solo lectura"})\n`);

  const { prisma: db, close } = createScriptDb();
  try {
    const { DIAS_DE_FRESCURA, ESTADOS_QUE_CUENTAN, colaTomaSoloNotas, motivoParaNoEncolar } = await import("@/lib/lecturas/reglas");
    const { buildInternalDomainsSet } = await import("@/lib/sessions/categorize");
    const { esReunionDePuertasAdentro } = await import("@/lib/sessions/candidatas-internas");
    const { duenoDeLaSesion } = await import("@/lib/sessions/project-sources");
    const { DONDE_PUEDE_TENER_TEXTO, claseDesdeLosLargos, largoDeLaTranscripcion, largoDeLasNotas } = await import("@/lib/sessions/tiene-texto");
    const ahora = new Date();

    const filas = await db.firefliesSession.findMany({
      where: sola
        ? { id: sola }
        : {
            date: { gte: new Date(+ahora - DIAS_DE_FRESCURA * 86_400_000), lte: ahora },
            enrichedAt: { not: null },
            AND: [DONDE_PUEDE_TENER_TEXTO, { OR: [{ resolvedClientId: { not: null } }, { manualClientId: { not: null } }] }],
          },
      select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true },
      orderBy: { date: "desc" },
    });
    if (!filas.length) {
      console.log(sola ? `No existe la reunión ${sola}.` : "No hay reuniones recientes con texto y dueño.");
      return;
    }
    const ids = filas.map((f) => f.id);
    const duenos = [...new Set(filas.map((f) => duenoDeLaSesion(f)).filter((x): x is string => !!x))];
    const [clientes, categorias, minutas] = await Promise.all([
      db.client.findMany({ where: { id: { in: duenos } }, select: { id: true, name: true, kind: true } }),
      db.sessionCategory.findMany({ select: { domains: true, kind: true } }),
      db.sessionMinute.findMany({ where: { sessionId: { in: ids } }, select: { sessionId: true } }),
    ]);
    const cliente = new Map(clientes.map((c) => [c.id, c]));
    const dominios = buildInternalDomainsSet(categorias);
    const conMinuta = new Set(minutas.map((m) => m.sessionId));
    let estados = new Map<string, string | null>();
    try {
      const lecturas = await db.lecturaDeReunion.findMany({ where: { sessionId: { in: ids } }, select: { sessionId: true, seguimientoEstado: true } });
      estados = new Map(lecturas.filter((l) => !!l.sessionId).map((l) => [l.sessionId!, l.seguimientoEstado]));
    } catch (e) {
      console.error(`⚠ No se pudo leer la cola (¿falta scripts/sql/2026-10-10-lectura-de-seguimiento.sql?): ${e instanceof Error ? e.message : e}`);
      if (escribir) throw new Error("Sin las columnas de la cola no se puede encolar.");
    }

    // Lo que ya tiene su lectura (o se está leyendo) no se toca; una en error, solo con --tambien-errores.
    const pendientes = filas.filter((f) => {
      if (conMinuta.has(f.id) && !sola) return false;
      const estado = estados.get(f.id) ?? null;
      if (estado && ESTADOS_EN_CURSO.includes(estado)) return false;
      if (estado === "error") return conErrores || !!sola;
      // Leída «sin texto» y sin minuta: si ahora tiene texto (llegó, o T2 cuenta sus notas), se vuelve a encolar.
      if (estado === "sin_texto") return true;
      if (estado && (ESTADOS_QUE_CUENTAN as readonly string[]).includes(estado)) return !!sola && estado !== "lista" && estado !== "copia";
      return true;
    });

    // El largo de la transcripción y de las notas, solo de las que quedan, de a 50 (no se trae el texto de todo).
    const largos = new Map<string, { transcript: number; notas: number }>();
    for (let i = 0; i < pendientes.length; i += 50) {
      const tanda = pendientes.slice(i, i + 50).map((f) => f.id);
      for (const t of await db.firefliesSession.findMany({ where: { id: { in: tanda } }, select: { id: true, transcript: true, summary: true } })) {
        largos.set(t.id, { transcript: largoDeLaTranscripcion(t.transcript), notas: largoDeLasNotas(t.summary) });
      }
    }

    const aEncolar: typeof pendientes = [];
    const porMotivo = new Map<string, number>();
    for (const f of pendientes) {
      const dueno = duenoDeLaSesion(f);
      const motivo = motivoParaNoEncolar(
        {
          kind: dueno ? (cliente.get(dueno)?.kind ?? null) : null,
          puertasAdentro: esReunionDePuertasAdentro({ participants: f.participants, organizerEmail: f.organizerEmail }, dominios),
          fecha: f.date,
          largoTranscript: largos.get(f.id)?.transcript ?? 0,
          largoNotas: largos.get(f.id)?.notas ?? 0,
          ahora,
        },
        { sinCorteDeFrescura: !!sola, leerSoloNotas: colaTomaSoloNotas(process.env) },
      );
      if (motivo) porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1);
      else aEncolar.push(f);
    }

    console.log(`${filas.length} reunión(es) mirada(s); ${pendientes.length} sin su lectura; ${aEncolar.length} para encolar.`);
    if (porMotivo.size) console.log(`No entran: ${[...porMotivo].map(([m, n]) => `${n} ${m}`).join(", ")}.`);
    for (const f of aEncolar.slice(0, max)) {
      const dueno = duenoDeLaSesion(f);
      const estado = estados.get(f.id) ?? "sin fila";
      const soloNotas = claseDesdeLosLargos({ transcripcion: largos.get(f.id)?.transcript ?? 0, notas: largos.get(f.id)?.notas ?? 0 }) === "solo_notas" ? " · solo notas" : "";
      console.log(`  · ${f.date.toISOString().slice(0, 10)} «${f.title}» (${f.id}) · ${cliente.get(dueno ?? "")?.name ?? "?"} · ${estado}${soloNotas}`);
    }
    if (aEncolar.length > max) console.log(`  · y ${aEncolar.length - max} más (--max para ver o encolar más)`);

    if (!escribir) {
      console.log("\nEn seco: no se escribió nada. Para encolarlas: ALLOW_PROD_WRITE=1 npx tsx scripts/encolar-lecturas-pendientes.ts --apply");
      return;
    }
    const { encolarSeguimiento } = await import("@/lib/lecturas/cola");
    let encoladas = 0;
    for (const f of aEncolar.slice(0, max)) {
      const r = await encolarSeguimiento(f.id, new Date(), 0, { sinCorteDeFrescura: !!sola });
      if (r.encolada) encoladas++;
      else console.log(`  · ${f.id} no entró: ${r.motivo}`);
    }
    console.log(`\n✓ ${encoladas} reunión(es) en la cola. El job «La lectura de cada reunión» las lee de a 2 por minuto, con presupuesto automático.`);
  } finally {
    await close();
  }
}

/** `--recuperacion`: lo atrasado, por lote (lib/lecturas/recuperacion.ts). */
async function recuperacion() {
  const escribir = resolverApply({ tablas: ["PedidoEnLote"] });
  const ahora = new Date();
  const desdeTexto = arg("--desde");
  const desde = desdeTexto ? new Date(`${desdeTexto}T00:00:00-06:00`) : new Date(+ahora - 90 * 86_400_000);
  if (Number.isNaN(+desde)) throw new Error(`--desde «${desdeTexto}» no es una fecha (AAAA-MM-DD).`);
  const limite = Number(arg("--limite") ?? 10);
  if (!Number.isInteger(limite) || limite < 1) throw new Error(`--limite «${arg("--limite")}» no es un número entero de 1 o más.`);
  const todas = process.argv.includes("--todas");
  const quien = arg("--por")?.trim().toLowerCase() || null;
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (${escribir ? "ESCRIBE" : "en seco, solo lectura"})`);
  console.log(`Recuperación: desde ${desde.toISOString().slice(0, 10)} hasta hace 14 días · ${todas ? "todas las empresas" : "solo las empresas activas"} · límite ${limite}\n`);

  const { close } = createScriptDb();
  try {
    const { recuperacionPrendida, soloNotasPrendido, TOPE_DE_LA_RECUPERACION } = await import("@/lib/lecturas/reglas");
    const { candidatasDeRecuperacion, caracteresEstimados, costoEstimadoPorLote, encolarRecuperacion } = await import("@/lib/lecturas/recuperacion");
    const { prisma } = await import("@/lib/db/prisma");
    if (!recuperacionPrendida(process.env)) console.log("⚠ LECTURA_DE_RECUPERACION=0: la recuperación está apagada (no se encola nada).\n");
    if (!soloNotasPrendido(process.env)) console.log("⚠ SEGUIMIENTO_SOLO_NOTAS=0: las reuniones con solo notas no entran.\n");
    if (limite > TOPE_DE_LA_RECUPERACION) console.log(`⚠ El tope por corrida es ${TOPE_DE_LA_RECUPERACION}: se toman ${TOPE_DE_LA_RECUPERACION}.\n`);

    const { candidatas, fuera, total, todas: elegibles } = await candidatasDeRecuperacion({ desde, limite, soloActivas: !todas, ahora });
    const prompt = (await prisma.agent.findUnique({ where: { id: "agent-post-session" }, select: { systemPrompt: true } }))?.systemPrompt ?? "";
    const largoDelPrompt = prompt.length + 3_000; // + la adenda de la herramienta
    const costo = (cs: readonly { caracteres: number }[]) => cs.reduce((s, c) => s + costoEstimadoPorLote(caracteresEstimados(c, largoDelPrompt)), 0);
    const notas = candidatas.filter((c) => c.clase === "solo_notas").length;

    console.log(`${total} reunión(es) para recuperar en el periodo; en este lote, ${candidatas.length} (${notas} con solo notas, ${candidatas.length - notas} con transcripción).`);
    const noEntran = Object.entries(fuera).filter(([, n]) => n > 0);
    if (noEntran.length) console.log(`No entran: ${noEntran.map(([m, n]) => `${n} ${m}`).join(", ")}.`);
    for (const c of candidatas) {
      console.log(`  · ${c.fecha.toISOString().slice(0, 10)} «${c.titulo}» (${c.sessionId}) · ${c.empresa} · ${c.clase === "solo_notas" ? "solo notas" : "transcripción"} · ${c.caracteres} car.`);
    }
    const porLote = costo(candidatas);
    console.log(`\nCosto estimado de este lote (API de lotes, mitad de precio, sin tareas): ~US$${porLote.toFixed(2)} (~US$${(porLote / Math.max(1, candidatas.length)).toFixed(3)} por reunión).`);
    if (total > candidatas.length) {
      const notasDelPeriodo = elegibles.filter((c) => c.clase === "solo_notas").length;
      console.log(
        `Todo el periodo (${total}: ${notasDelPeriodo} con solo notas, ${total - notasDelPeriodo} con transcripción): ~US$${costo(elegibles).toFixed(2)}, ` +
          `en ${Math.ceil(total / TOPE_DE_LA_RECUPERACION)} corrida(s) de hasta ${TOPE_DE_LA_RECUPERACION}.`,
      );
    }

    if (!escribir) {
      console.log(`\nEn seco: no se escribió nada. Para encolarlas: ALLOW_PROD_WRITE=1 npx tsx scripts/encolar-lecturas-pendientes.ts --recuperacion --desde ${desde.toISOString().slice(0, 10)} --limite ${limite}${todas ? " --todas" : ""} --por <tu correo> --desplegado --apply   (solo después del deploy que trae la recuperación)`);
      return;
    }
    if (!process.argv.includes("--desplegado")) {
      throw new Error(
        "Falta --desplegado. La recuperación se encola SOLO después del deploy que la trae: con el código viejo, el job de lotes de producción mandaría estos pedidos y los tiraría al volver (pagados). Cuando /api/health muestre el commit nuevo, vuelve a correrlo con --desplegado.",
      );
    }
    if (!quien) throw new Error("Falta --por <tu correo>: el gasto de la recuperación se anota a nombre de quien la corre.");
    // El nombre del gasto tiene que ser alguien del equipo: un error de dominio lo dejaría a nombre de nadie.
    if (!(await prisma.teamMember.findFirst({ where: { email: { equals: quien, mode: "insensitive" } }, select: { id: true } }))) {
      throw new Error(`--por ${quien}: no es el correo de nadie del equipo (TeamMember). Usa tu correo de Smarteam.`);
    }
    const r = await encolarRecuperacion(
      candidatas.map((c) => c.sessionId),
      quien,
    );
    const encoladas = r.filter((x) => x.estado === "encolada");
    for (const x of r.filter((x) => x.estado !== "encolada")) console.log(`  · ${x.sessionId} no entró: ${x.estado}`);
    const estimado = encoladas.reduce((s, x) => s + (x.costoEstimado ?? 0), 0);
    console.log(
      `\n✓ ${encoladas.length} lectura(s) en el lote (~US$${estimado.toFixed(2)}). El job «ia-lotes» las manda en 5 minutos y deja cada minuta cuando ` +
        `Anthropic responde (casi siempre en menos de una hora). Lo gastado se ve en Integraciones › Gasto de la IA, a nombre de ${quien}.`,
    );
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
