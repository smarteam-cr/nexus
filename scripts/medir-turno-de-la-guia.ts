/**
 * scripts/medir-turno-de-la-guia.ts — cuánto tarda un turno del chat de Nexus sobre la guía de la preventa (validación 106
 * del roadmap, 2026-10-18), con Distribuidora Larce. NO ESCRIBE el hilo ni la exploración.
 *
 * Corre el turno de verdad (`pensarElTurno` de lib/nexus-chat/turno-server.ts: lo pendiente, el contexto de la cuenta, la
 * guía en el mensaje y el bucle con las herramientas reales, que preparan sin escribir) y mide cada parte: armar el
 * contexto, cada llamada al modelo, cada herramienta, y volver a preparar lo propuesto como hace «Aplicar» (lo que
 * tarda aplicar sin la escritura).
 *
 * ── QUÉ ESCRIBE ──────────────────────────────────────────────────────────────────────────────
 *   · Nada, salvo la telemetría de `LlmCall` que anota el cliente de Anthropic, a nombre de --por (presupuesto humano).
 *
 * ── CÓMO SE CORRE ────────────────────────────────────────────────────────────────────────────
 * ⚠ LLAMA A CLAUDE: dos pedidos de un turno cada uno (unos US$0,10–0,30 en total).
 *
 *   npx tsx scripts/medir-turno-de-la-guia.ts --por egonzalez@smarteamcr.com
 *   npx tsx scripts/medir-turno-de-la-guia.ts --por … --id <exploracionId> --veces 2
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.DB_POOL_MAX ??= "2";

const LARCE = "cmvbcuvcs016706t1xcny5pss";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  if (i > -1) return process.argv[i + 1] ?? null;
  const conIgual = process.argv.find((a) => a.startsWith(`${nombre}=`));
  return conIgual ? conIgual.slice(nombre.length + 1) : null;
}
const POR = (arg("--por") ?? "").trim().toLowerCase();
const ID = arg("--id") ?? LARCE;
const VECES = Math.max(1, Number(arg("--veces") ?? "1") || 1);

const PEDIDOS = ["¿Qué otras preguntas agregarías?", "Mejora las repreguntas de la pregunta 2 para que bajen a números."];

async function main() {
  if (!POR.includes("@")) {
    console.error("Falta --por <tu correo>: las llamadas a Claude se anotan a tu nombre, contra el presupuesto humano.");
    process.exit(1);
  }
  const { prisma } = await import("@/lib/db/prisma");
  const { pensarElTurno } = await import("@/lib/nexus-chat/turno-server");
  const { contextoDelChat, prepararParaLaCuenta } = await import("@/lib/nexus-chat/herramientas-server");
  try {
    const exp = await prisma.exploracionDeVenta.findUnique({ where: { id: ID }, select: { clientId: true, client: { select: { name: true } } } });
    const persona = await prisma.teamMember.findFirst({ where: { email: POR } });
    if (!exp || !persona) throw new Error("No encontré la exploración o a la persona.");
    console.log(`\n${exp.client.name} · exploración ${ID}\n`);
    for (let v = 0; v < VECES; v++) {
      for (const pedido of PEDIDOS) {
        const t0 = Date.now();
        const r = await pensarElTurno({
          hilo: { id: "medir", usuarioEmail: POR, modelo: undefined, turnos: [] },
          mensaje: pedido,
          quien: { persona, clientId: exp.clientId, veMontos: true },
          ahora: new Date(),
          foco: { tipo: "guia", exploracionId: ID },
          agentRunId: null,
        });
        const total = Date.now() - t0;
        // «Aplicar» vuelve a preparar cada cambio antes de escribir: eso es lo que tarda sin la escritura.
        const tA = Date.now();
        const ctx = contextoDelChat(persona, true, new Date());
        for (const c of r.propuestos) await prepararParaLaCuenta(ctx, exp.clientId, c.nombre, c.entrada);
        const aplicar = Date.now() - tA;
        console.log(`«${pedido}»`);
        console.log(`   total ${(total / 1000).toFixed(1)} s · contexto ${(r.tiempos.contextoMs / 1000).toFixed(1)} s · guía ${(r.tiempos.focoMs / 1000).toFixed(1)} s`);
        for (const [i, l] of r.tiempos.llamadas.entries()) console.log(`   llamada ${i + 1}: ${(l.ms / 1000).toFixed(1)} s · ${l.entrada} entrada · ${l.cacheLeida} caché leída · ${l.cacheEscrita} caché escrita · ${l.salida} salida`);
        for (const h of r.tiempos.herramientas) console.log(`   herramienta ${h.nombre}: ${(h.ms / 1000).toFixed(1)} s`);
        console.log(`   re-preparar al aplicar (${r.propuestos.length}): ${(aplicar / 1000).toFixed(1)} s`);
        console.log(`   propuso: ${r.propuestos.map((c) => c.linea).join(" | ") || "(nada)"}`);
        if (r.rechazados.length) console.log(`   rechazado: ${r.rechazados.map((x) => x.motivo).join(" | ")}`);
        console.log(`   contesta: ${r.respuesta.slice(0, 400)}\n`);
      }
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
