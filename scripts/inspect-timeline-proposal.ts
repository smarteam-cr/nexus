/**
 * scripts/inspect-timeline-proposal.ts  (READ-ONLY)
 * Inspecciona el cronograma de un proyecto + la propuesta pendiente.
 * Con un borrador `borrador-v1` imprime el formato, la versión, el origen, `soloFase` («Regenerar» de
 * una fase), el estado de las tareas y los cambios por tipo. E4: lo guardado es siempre un v1; si no
 * lo es, lo dice y remite a `scripts/propuestas-abiertas.ts --antes-de-e4`, el único que todavía
 * conoce el formato viejo.
 * Uso: npx tsx scripts/inspect-timeline-proposal.ts <projectId>
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import { esBorradorV1, estadoDeLasTareas, leerBorrador } from "../lib/timeline/borrador";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const projectId = process.argv[2];
  if (!projectId) { console.log("Uso: npx tsx scripts/inspect-timeline-proposal.ts <projectId>"); return; }

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      anchorStartDate: true,
      pendingProposalRunId: true,
      pendingProposal: true,
      project: { select: { name: true, client: { select: { name: true } } } },
      phases: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, order: true, durationWeeks: true, activityType: true, _count: { select: { tasks: true } }, tasks: { select: { status: true } } },
      },
    },
  });
  if (!tl) { console.log(`No hay ProjectTimeline para project ${projectId}`); return; }

  console.log(`\n══ ${tl.project?.client?.name} › ${tl.project?.name}  [${projectId}] ══`);
  console.log(`anchorStartDate: ${tl.anchorStartDate?.toISOString().slice(0, 10) ?? "(sin fijar)"}\n`);

  console.log(`── Fases actuales (${tl.phases.length}) ──`);
  for (const p of tl.phases) {
    const byStatus = p.tasks.reduce<Record<string, number>>((acc, t) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc; }, {});
    const statusStr = Object.entries(byStatus).map(([s, n]) => `${s}:${n}`).join(" ") || "—";
    console.log(`  [${p.order}] ${p.id}  "${p.name}"  ${p.durationWeeks}sem  tipo:${p.activityType ?? "—"}  tareas:${p._count.tasks} (${statusStr})`);
  }

  console.log(`\n── Propuesta pendiente ──`);
  if (!tl.pendingProposal) {
    console.log("  (ninguna — pendingProposal = null)");
  } else if (esBorradorV1(tl.pendingProposal)) {
    // El borrador nuevo no trae `phases`: se lee con el mismo lector que la pantalla y el servidor.
    const b = leerBorrador(tl.pendingProposal);
    if (!b) { console.log("  formato: borrador-v1 (ilegible)"); return; }
    const corrida = b.tareas?.corrida
      ? await prisma.agentRun.findUnique({
          where: { id: b.tareas.corrida },
          select: { status: true, updatedAt: true, currentPhase: true },
        })
      : null;
    const estado = estadoDeLasTareas(b.tareas, corrida);
    const porTipo = b.cambios.reduce<Record<string, number>>((acc, c) => { acc[c.tipo] = (acc[c.tipo] ?? 0) + 1; return acc; }, {});
    // «Regenerar» de una fase (E2b): su id y su nombre de hoy (o que ya no está).
    const faseSola = b.soloFase ? tl.phases.find((p) => p.id === b.soloFase) : undefined;
    const soloFase = b.soloFase ? `${b.soloFase} (${faseSola ? `«${faseSola.name}»` : "ya no está"})` : "—";
    console.log(`  formato: ${b.formato}  versión: ${b.version}  origen: ${b.origen}  pedido: ${b.pedido ?? "—"}  soloFase: ${soloFase}`);
    console.log(`  pendingProposalRunId (token): ${tl.pendingProposalRunId ?? "—"}`);
    console.log(
      `  tareas: ${estado ?? "no espera tareas"}` +
        (b.tareas?.corrida ? `  (corrida ${b.tareas.corrida}: ${corrida ? `${corrida.status}${corrida.currentPhase ? ` · ${corrida.currentPhase}` : ""}` : "sin fila"})` : ""),
    );
    const tipos = Object.entries(porTipo).map(([t, n]) => `${t}:${n}`).join("  ") || "—";
    console.log(`  cambios: ${b.cambios.length}  (${tipos})${b.desconocidos ? `  ⚠ desconocidos: ${b.desconocidos}` : ""}`);
    console.log(`  fases con tareas armadas: ${Object.keys(b.tareasArmadasPara).length}  observaciones: ${b.observaciones.length}`);
    return;
  } else {
    console.log("  no es borrador-v1: corre npx tsx scripts/propuestas-abiertas.ts --antes-de-e4");
    console.log(`  pendingProposalRunId: ${tl.pendingProposalRunId ?? "—"}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
