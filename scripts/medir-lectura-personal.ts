/**
 * scripts/medir-lectura-personal.ts — cómo va el piloto de la lectura personal (roadmap H1, 2026-10-27; DECISIONS
 * «Tareas, noche 2: tus reuniones internas te proponen tareas…»). Por persona del piloto, en los últimos N días: cuántas
 * reuniones internas se leyeron, cuántas tareas propusieron (y cuántas de revisión), qué pasó con ellas (aceptadas,
 * descartadas, vencidas, por decidir) y lo que costó la IA. El criterio de H: menos de una de cada tres descartada por
 * ruido.
 *
 * ⛔ SOLO LECTURA: la base se abre en solo lectura. Imprime correos del equipo (es interno) y ningún título.
 *
 *   npx tsx scripts/medir-lectura-personal.ts              (los últimos 7 días)
 *   npx tsx scripts/medir-lectura-personal.ts --dias=14
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.PGOPTIONS = [process.env.PGOPTIONS, "-c default_transaction_read_only=on -c statement_timeout=60000"].filter(Boolean).join(" ");

const DIAS = Number(process.argv.find((a) => a.startsWith("--dias="))?.slice(7) ?? 7) || 7;

async function main() {
  const { prisma } = await import("@/lib/db/prisma");
  const { describirDestino } = await import("./lib/guard");
  const { SERIE_PERSONAL } = await import("@/lib/tareas/lectura-personal");
  const desde = new Date(Date.now() - DIAS * 86_400_000);
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL)} · SOLO LECTURA · últimos ${DIAS} días\n`);

  const fuentes = await prisma.fuenteDeTareas.findMany({ where: { equipo: null, serie: SERIE_PERSONAL }, select: { id: true, duenoEmail: true, activa: true, createdAt: true } });
  if (!fuentes.length) {
    console.log("Nadie tiene la lectura personal prendida todavía (TAREAS_LECTURA_PERSONAL vacía, o el job no corrió).");
    return;
  }
  for (const f of fuentes) {
    const lecturas = await prisma.lecturaDeReunion.findMany({
      where: { fuenteId: f.id, createdAt: { gte: desde } },
      select: { id: true, estado: true, agentRunId: true },
    });
    const ids = lecturas.map((l) => l.id);
    const tareas = ids.length
      ? await prisma.tarea.findMany({ where: { lecturaId: { in: ids }, responsableEmail: f.duenoEmail }, select: { id: true, estado: true, decision: true, decididaPorEmail: true, origenId: true } })
      : [];
    const revision = tareas.filter((t) => (t.origenId ?? "").endsWith(":revision"));
    const porPersona = (t: (typeof tareas)[number]) => !!t.decididaPorEmail && t.decididaPorEmail !== "sistema";
    const aceptadas = tareas.filter((t) => ["pendiente", "en_curso", "hecha", "no_se_hara"].includes(t.estado));
    const descartadas = tareas.filter((t) => t.estado === "rechazada" && porPersona(t));
    const juntadas = tareas.filter((t) => t.estado === "fusionada" && porPersona(t));
    const vencidas = tareas.filter((t) => t.estado === "vencida");
    const porDecidir = tareas.filter((t) => t.estado === "propuesta");
    // El costo: lo que la IA de Tareas gastó a nombre de la persona (la lectura personal la pide ella, así que también
    // suma lo que haya pedido a mano en Tareas esos días).
    const gasto = await prisma.llmCall.aggregate({
      where: { agentSlug: { startsWith: "tareas-" }, triggeredByEmail: f.duenoEmail, at: { gte: desde } },
      _sum: { costUsd: true },
      _count: { _all: true },
    });
    const usd = gasto._sum.costUsd ?? 0;
    const decididas = aceptadas.length + descartadas.length + juntadas.length;
    console.log(`${f.duenoEmail} · ${f.activa ? "prendida" : "PAUSADA"} desde el ${f.createdAt.toISOString().slice(0, 10)}`);
    console.log(`  reuniones leídas: ${lecturas.length} (${lecturas.filter((l) => l.estado === "lista").length} con tareas o sin pendientes, ${lecturas.filter((l) => l.estado === "sin_texto").length} sin texto)`);
    console.log(`  propuestas: ${tareas.length} (${revision.length} de revisión)`);
    console.log(`  aceptadas ${aceptadas.length} · descartadas ${descartadas.length} · era otra ${juntadas.length} · vencidas ${vencidas.length} · por decidir ${porDecidir.length}`);
    console.log(`  ruido: ${decididas ? Math.round((descartadas.length / decididas) * 100) : 0} % de lo decidido se descartó (la meta: menos de 33 %)`);
    console.log(`  costo de la IA de Tareas a su nombre: US$ ${usd.toFixed(3)} en ${gasto._count._all} llamadas (incluye lo que pidió a mano)\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
  });
