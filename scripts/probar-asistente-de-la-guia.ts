/**
 * scripts/probar-asistente-de-la-guia.ts — UNA CONVERSACIÓN REAL CON «MEJORAR CON EL ASISTENTE» sobre la guía de una
 * exploración (2026-10-20, caso CEMACO): ¿lee todas las sesiones, no repregunta lo cubierto y toma lo que se pidió?
 *
 * Corre turnos de verdad del chat de Nexus abierto desde la guía (`correrTurnoDeNexus`, el mismo de la ruta), con el
 * chip de la guía, e imprime lo que contestó, lo que propuso, lo rechazado, el costo y los tiempos de cada turno.
 * Nunca aplica la lista: la guía no cambia.
 *
 * ── QUÉ ESCRIBE ──────────────────────────────────────────────────────────────────────────────
 *   · Sin --apply: nada. Los turnos corren con `pensarElTurno` (sin hilo guardado); solo queda la telemetría de
 *     `LlmCall`, a nombre de --por.
 *   · Con --apply: un hilo de prueba NUEVO de --por en esa cuenta (sus turnos y la corrida de cada uno), que se BORRA al
 *     final, también si algo falla. Va con el guard (INV12). Usa un hilo nuevo: el que la persona tenga abierto no se toca.
 *
 * ── CÓMO SE CORRE ────────────────────────────────────────────────────────────────────────────
 * ⚠ LLAMA A CLAUDE: un turno por mensaje (unos US$0,05–0,15 cada uno).
 *
 *   npx tsx scripts/probar-asistente-de-la-guia.ts --id <exploracionId> --por <tu correo> \
 *       --mensaje "¿Qué otras preguntas agregarías para la próxima sesión?" --mensaje "…"
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/probar-asistente-de-la-guia.ts … --apply
 *
 * Wherex queda fuera siempre.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { assertProdWriteAllowed } from "./lib/guard";

process.env.DB_POOL_MAX ??= "2";

function args(nombre: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === nombre && process.argv[i + 1]) out.push(process.argv[i + 1]);
    else if (a.startsWith(`${nombre}=`)) out.push(a.slice(nombre.length + 1));
  });
  return out;
}
const ID = args("--id")[0];
const POR = (args("--por")[0] ?? "").trim().toLowerCase();
const MENSAJES = args("--mensaje");
const APPLY = process.argv.includes("--apply");

/** Cada pregunta propuesta entera, con sus repreguntas (la línea de la lista la recorta). */
function enteras(ops: unknown[] | undefined): string[] | null {
  if (!ops?.length) return null;
  return ops.map((o) => {
    const e = (o as { nombre?: string; entrada?: { pregunta?: string; repreguntas?: string[]; clave?: string } }) ?? {};
    const r = e.entrada?.repreguntas?.length ? ` → ${e.entrada.repreguntas.join(" / ")}` : "";
    return `${e.nombre ?? "?"}: ${e.entrada?.pregunta ?? e.entrada?.clave ?? ""}${r}`;
  });
}

async function main() {
  if (!ID || !POR.includes("@") || !MENSAJES.length) {
    console.error("Uso: --id <exploracionId> --por <tu correo> --mensaje «…» [--mensaje «…»] [--apply]");
    process.exit(1);
  }
  if (APPLY) assertProdWriteAllowed("scripts/probar-asistente-de-la-guia.ts (hilo de prueba que se borra)");
  const { prisma } = await import("@/lib/db/prisma");
  const { correrTurnoDeNexus, pensarElTurno } = await import("@/lib/nexus-chat/turno-server");
  const { empezarDeCero, leerHilo } = await import("@/lib/asistente/hilo");
  const { MODELO_DEL_ASISTENTE } = await import("@/lib/asistente/turno");
  const { PIEZA_NEXUS } = await import("@/lib/nexus-chat/constantes");
  let hiloId: string | null = null;
  try {
    const exp = await prisma.exploracionDeVenta.findUnique({ where: { id: ID }, select: { clientId: true, marco: true, client: { select: { name: true } } } });
    const persona = await prisma.teamMember.findFirst({ where: { email: POR } });
    if (!exp || !persona) throw new Error("No encontré la exploración o a la persona.");
    if (/wherex/i.test(exp.client.name)) throw new Error("Wherex queda fuera.");
    const quien = { persona, clientId: exp.clientId, veMontos: true };
    const foco = { tipo: "guia" as const, exploracionId: ID };
    console.log(`\n${exp.client.name} · exploración ${ID} (${exp.marco}) · ${APPLY ? "hilo de prueba guardado (se borra al final)" : "sin guardar"}\n`);

    const pedido = { dueno: { clientId: exp.clientId }, pieza: PIEZA_NEXUS, usuarioEmail: POR, modelo: MODELO_DEL_ASISTENTE };
    const turnos: Array<{ rol: "user" | "assistant"; texto: string }> = [];
    if (APPLY) hiloId = (await empezarDeCero(pedido)).id;

    for (const mensaje of MENSAJES) {
      const t0 = Date.now();
      let respuesta: string;
      let lineas: string[];
      let costo: number | null = null;
      let tiempos: unknown = null;
      if (APPLY && hiloId) {
        const hilo = await leerHilo(hiloId, { clientId: exp.clientId }, POR);
        if (!hilo) throw new Error("El hilo de prueba no está.");
        const r = await correrTurnoDeNexus(hilo, mensaje, quien, new Date(), foco);
        respuesta = r.respuesta;
        lineas = enteras(r.acuerdo?.operaciones) ?? r.acuerdo?.lineas ?? [];
        costo = r.costoUsd;
        const run = await prisma.agentRun.findFirst({ where: { clientId: exp.clientId, triggeredByEmail: POR, agentSlug: "nexus-chat" }, orderBy: { createdAt: "desc" }, select: { output: true } });
        tiempos = run?.output ? (JSON.parse(run.output) as { tiempos?: unknown }).tiempos : null;
      } else {
        const r = await pensarElTurno({
          hilo: {
            id: "probar",
            usuarioEmail: POR,
            turnos: turnos.map((t, i) => ({ id: `t${i}`, rol: t.rol === "user" ? ("CSE" as const) : ("ASISTENTE" as const), contenido: t.texto, shaDeContexto: null, createdAt: new Date() })),
          },
          mensaje,
          quien,
          ahora: new Date(),
          foco,
          agentRunId: null,
        });
        respuesta = r.respuesta;
        lineas = enteras(r.acuerdo?.operaciones) ?? r.acuerdo?.lineas ?? [];
        tiempos = r.tiempos;
        if (r.rechazados.length) console.log(`   rechazado: ${r.rechazados.map((x) => x.motivo).join(" | ")}`);
      }
      turnos.push({ rol: "user", texto: mensaje }, { rol: "assistant", texto: respuesta });
      console.log(`» ${mensaje}`);
      console.log(`  ${respuesta.replace(/\n/g, "\n  ")}`);
      for (const l of lineas) console.log(`   · ${l}`);
      console.log(`   ${((Date.now() - t0) / 1000).toFixed(1)} s${costo != null ? ` · US$${costo.toFixed(4)}` : ""}`);
      const t = tiempos as { llamadas?: Array<{ ms: number; entrada: number; cacheLeida: number; cacheEscrita: number; salida: number }>; contextoMs?: number; focoMs?: number } | null;
      if (t?.llamadas) {
        console.log(`   contexto ${t.contextoMs} ms · guía ${t.focoMs} ms`);
        for (const [i, l] of t.llamadas.entries()) console.log(`   llamada ${i + 1}: ${(l.ms / 1000).toFixed(1)} s · ${l.entrada} entrada · ${l.cacheLeida} caché leída · ${l.cacheEscrita} caché escrita · ${l.salida} salida`);
      }
      console.log("");
    }
  } finally {
    if (hiloId) {
      // El hilo de prueba se va con sus turnos (cascade) y las corridas que dejó.
      const corridas = await prisma.agentRun.findMany({ where: { agentSlug: "nexus-chat", triggeredByEmail: POR, output: { contains: hiloId } }, select: { id: true } });
      await prisma.agentRun.deleteMany({ where: { id: { in: corridas.map((c) => c.id) } } });
      await prisma.hiloDeChat.delete({ where: { id: hiloId } });
      console.log(`Hilo de prueba ${hiloId} borrado (con ${corridas.length} corridas).`);
    }
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
