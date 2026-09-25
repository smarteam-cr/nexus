/**
 * scripts/inspect-timeline-proposal.ts  (READ-ONLY)
 * Inspecciona el cronograma de un proyecto + la propuesta pendiente de re-generación.
 * Sirve para verificar la invariante NO-destructiva: las fases de pendingProposal llevan
 * id (matchean a existentes) y NO traen `tasks` (→ el PUT preserva el detalle/progreso).
 * Con un borrador `borrador-v1` (E1/E2a: no tiene `phases`) imprime el formato, la versión, el
 * estado de las tareas y los cambios por tipo, y termina. Antes reventaba en `prop.phases`.
 * Uso: npx tsx scripts/inspect-timeline-proposal.ts <projectId>
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import { esBorradorV1, estadoDeLasTareas, leerBorrador } from "../lib/timeline/borrador";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type ProposalPhase = { id?: string; name: string; order: number; durationWeeks: number; tasks?: unknown[] };
type Proposal = { anchorStartDate: string | null; phases: ProposalPhase[] };

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
    const b = leerBorrador(tl.pendingProposal, { ancla: null, fases: [] });
    if (!b) { console.log("  formato: borrador-v1 (ilegible)"); return; }
    const corrida = b.tareas?.corrida
      ? await prisma.agentRun.findUnique({
          where: { id: b.tareas.corrida },
          select: { status: true, updatedAt: true, currentPhase: true },
        })
      : null;
    const estado = estadoDeLasTareas(b.tareas, corrida);
    const porTipo = b.cambios.reduce<Record<string, number>>((acc, c) => { acc[c.tipo] = (acc[c.tipo] ?? 0) + 1; return acc; }, {});
    console.log(`  formato: ${b.formato}  versión: ${b.version}  origen: ${b.origen}  pedido: ${b.pedido ?? "—"}`);
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
    const prop = tl.pendingProposal as unknown as Proposal;
    const existingIds = new Set(tl.phases.map((p) => p.id));
    const withId = prop.phases.filter((p) => p.id).length;
    const withValidId = prop.phases.filter((p) => p.id && existingIds.has(p.id)).length;
    const withTasks = prop.phases.filter((p) => Array.isArray(p.tasks)).length;
    console.log(`  pendingProposalRunId: ${tl.pendingProposalRunId ?? "—"}`);
    console.log(`  anchorStartDate: ${prop.anchorStartDate ?? "null"}`);
    console.log(`  fases: ${prop.phases.length}  (con id: ${withId}, id válido existente: ${withValidId}, con clave tasks: ${withTasks})`);
    if (withTasks > 0) console.log(`  ⚠ ALGUNA FASE TRAE \`tasks\` — el PUT borraría/recrearía tareas (rompe la invariante no-destructiva).`);
    else console.log(`  ✓ Ninguna fase trae \`tasks\` → aplicar preserva el detalle/progreso.`);
    for (const p of prop.phases) {
      const tag = !p.id ? "NUEVA" : existingIds.has(p.id) ? "match" : "id-desconocido";
      console.log(`    [${p.order}] ${p.id ?? "(sin id)"}  "${p.name}"  ${p.durationWeeks}sem  [${tag}]`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
