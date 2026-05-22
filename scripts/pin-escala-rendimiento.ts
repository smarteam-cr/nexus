/**
 * Pin del documento "Escala de Rendimiento Smarteam" a los agentes que lo necesitan.
 *
 * Targets:
 *   - Agente con name = "Análisis de ventas" (el del módulo /sales)
 *   - Todos los agentes con agentGroup = "diagnostico"
 *
 * Uso: npx tsx scripts/pin-escala-rendimiento.ts
 *
 * Es idempotente: si el ID ya está en `pinnedKnowledgeIds`, no hace nada.
 * Corré primero `scripts/seed-escala-rendimiento.ts` para asegurar que el doc exista.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DOC_TITLE = "Escala de Rendimiento Smarteam";

async function main() {
  console.log(`[pin-escala-rendimiento] Iniciando...`);

  // 1. Buscar el doc
  const doc = await prisma.knowledgeDocument.findFirst({
    where: { title: DOC_TITLE },
    select: { id: true, title: true, version: true },
  });
  if (!doc) {
    throw new Error(
      `El documento "${DOC_TITLE}" no existe. Corré primero: npx tsx scripts/seed-escala-rendimiento.ts`
    );
  }
  console.log(`[pin-escala-rendimiento] Doc encontrado: ${doc.id} (v${doc.version})`);

  // 2. Buscar targets
  const targets = await prisma.agent.findMany({
    where: {
      OR: [
        { name: "Análisis de ventas" },
        { agentGroup: "diagnostico" },
      ],
    },
    select: { id: true, name: true, agentGroup: true, pinnedKnowledgeIds: true },
  });

  if (targets.length === 0) {
    console.log(`[pin-escala-rendimiento] No se encontró ningún agente target. Salida sin cambios.`);
    return;
  }

  console.log(`[pin-escala-rendimiento] ${targets.length} agente(s) target encontrado(s).`);

  // 3. Pin idempotente
  let pinned = 0;
  let skipped = 0;
  for (const a of targets) {
    if (a.pinnedKnowledgeIds.includes(doc.id)) {
      console.log(`  ✓ ya pineado: ${a.name}${a.agentGroup ? ` [${a.agentGroup}]` : ""}`);
      skipped++;
      continue;
    }
    await prisma.agent.update({
      where: { id: a.id },
      data: { pinnedKnowledgeIds: { push: doc.id } },
    });
    console.log(`  + pineado: ${a.name}${a.agentGroup ? ` [${a.agentGroup}]` : ""}`);
    pinned++;
  }

  console.log(`[pin-escala-rendimiento] Listo. Nuevos: ${pinned} · Ya existentes: ${skipped}`);
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
