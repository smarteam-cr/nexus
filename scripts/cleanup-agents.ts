/**
 * scripts/cleanup-agents.ts
 *
 * Borra agentes DUPLICADOS / HUÉRFANOS que quedaron del histórico y NO se usan en
 * el flujo actual. Patrón dry-run → --apply (igual que cleanup-handoff-dup-projects).
 *
 * SEGURIDAD: solo borra agentes con 0 ejecuciones (runs). Si un target tiene runs,
 * se SALTA y se reporta (no se borra nada con historial). Cada target nombra su
 * canónico (el que se queda) para dejar claro que no se pierde funcionalidad.
 *
 * Uso:
 *   npx tsx scripts/cleanup-agents.ts            (dry-run: solo reporta)
 *   npx tsx scripts/cleanup-agents.ts --apply    (borra de verdad)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const APPLY = process.argv.includes("--apply");

// Targets a borrar (todos detectados con 0 runs en la auditoría). El "keep" es el
// agente canónico que cumple esa función y se queda.
const TARGETS: { id: string; expectedName: string; reason: string; keep: string }[] = [
  {
    id: "cmn4q2yv7000098iiyoecpffs",
    expectedName: "Canvas de proyecto",
    reason: "Duplicado CANVAS_PROJECT",
    keep: "canvas-project (Canvas de proyecto)",
  },
  {
    id: "cmn4q38e1000198iijp7eid7b",
    expectedName: "Canvas de empresa",
    reason: "Huérfano CANVAS_CLIENT",
    keep: "canvas-client (Información del cliente)",
  },
  {
    id: "cmowfotvz0000x4ijsr4xo1rw",
    expectedName: "Análisis de ventas",
    reason: "Sobrante (duplicado de análisis de ventas)",
    keep: "agent-sales-analysis (Análisis de ventas)",
  },
];

async function main() {
  console.log(`\n=== cleanup-agents ${APPLY ? "(APPLY)" : "(DRY-RUN)"} ===\n`);

  const toDelete: string[] = [];

  for (const t of TARGETS) {
    const agent = await prisma.agent.findUnique({
      where: { id: t.id },
      select: { id: true, name: true, agentType: true, agentGroup: true, _count: { select: { runs: true } } },
    });

    if (!agent) {
      console.log(`• [ya no existe] ${t.id} (${t.expectedName}) — nada que hacer`);
      continue;
    }
    if (agent._count.runs > 0) {
      console.log(`• [SALTO] ${agent.id} (${agent.name}) tiene ${agent._count.runs} runs → NO se borra. Revisar a mano.`);
      continue;
    }

    console.log(
      `• [borrar] ${agent.id} (${agent.name}) — ${t.reason}. 0 runs. Canónico que se queda: ${t.keep}`,
    );
    toDelete.push(agent.id);
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN: se borrarían ${toDelete.length} agentes. Corré con --apply para ejecutar.`);
    return;
  }

  if (toDelete.length === 0) {
    console.log(`\nNada que borrar.`);
    return;
  }

  const res = await prisma.agent.deleteMany({ where: { id: { in: toDelete } } });
  console.log(`\n✓ Borrados ${res.count} agentes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
