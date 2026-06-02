/**
 * Migra los Project.pendingItems (Json) a la nueva tabla ActionItem.
 *
 * - Idempotente: no crea duplicados si encuentra un ActionItem con
 *   text + clientId + source: "legacy" idénticos.
 * - Preserva el `done` original.
 * - Setea sessionId = null (no se conocía de qué sesión salieron).
 * - Vacía el Project.pendingItems al finalizar (los nuevos van a la tabla).
 *
 * Uso:
 *   npx tsx scripts/migrate-pending-items-to-action-items.ts        # dry-run (default)
 *   npx tsx scripts/migrate-pending-items-to-action-items.ts --apply # ejecuta
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

interface LegacyPendingItem {
  text?: string;
  done?: boolean;
  source?: string;
  addedAt?: string;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (usa --apply para ejecutar)"}\n`);

  const projects = await prisma.project.findMany({
    where: { pendingItems: { not: null as never } },
    select: { id: true, clientId: true, name: true, pendingItems: true },
  });

  console.log(`Encontrados ${projects.length} proyectos con pendingItems\n`);

  let totalItems = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalProjectsCleared = 0;

  for (const p of projects) {
    const items = Array.isArray(p.pendingItems)
      ? (p.pendingItems as unknown as LegacyPendingItem[])
      : [];
    if (items.length === 0) continue;

    console.log(`[${p.id}] ${p.name}: ${items.length} item(s)`);
    totalItems += items.length;

    let createdInProject = 0;
    let skippedInProject = 0;

    for (const item of items) {
      const text = (item.text ?? "").trim();
      if (!text) {
        skippedInProject++;
        continue;
      }

      // Idempotencia: ¿ya existe un ActionItem legacy con este texto y cliente?
      const existing = await prisma.actionItem.findFirst({
        where: {
          clientId: p.clientId,
          projectId: p.id,
          text,
          source: "legacy",
        },
        select: { id: true },
      });
      if (existing) {
        skippedInProject++;
        continue;
      }

      if (apply) {
        await prisma.actionItem.create({
          data: {
            clientId: p.clientId,
            projectId: p.id,
            text,
            done: !!item.done,
            status: item.done ? "DONE" : "PENDING",
            source: "legacy",
            // ownerEmail, dueDate, sessionId: null
          },
        });
      }
      createdInProject++;
    }

    if (apply && createdInProject > 0) {
      // Vaciar pendingItems del Project (ya migrado)
      await prisma.project.update({
        where: { id: p.id },
        data: { pendingItems: [] },
      });
      totalProjectsCleared++;
    }

    console.log(`  → ${createdInProject} migrado(s), ${skippedInProject} saltado(s) (vacío/duplicado)`);
    totalCreated += createdInProject;
    totalSkipped += skippedInProject;
  }

  console.log(`\n=== Resumen ===`);
  console.log(`Items totales en pendingItems: ${totalItems}`);
  console.log(`ActionItems ${apply ? "creados" : "que se crearían"}: ${totalCreated}`);
  console.log(`Saltados (vacíos/duplicados): ${totalSkipped}`);
  console.log(`Proyectos vaciados: ${totalProjectsCleared}`);
  if (!apply) console.log(`\n(dry-run — sin cambios reales. Corre con --apply para ejecutar)`);
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
