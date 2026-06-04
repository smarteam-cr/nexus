/**
 * scripts/migrate-procesos-to-blocks.ts
 *
 * Migra la sección "procesos" del ex-canvas Resumen (modelo ClientContextCard) a
 * bloques (CanvasBlock) en la sección "procesos" del canvas "Información del
 * cliente". MOVE: crea el bloque y BORRA la card. Idempotente (re-correr no
 * re-procesa, porque ya no quedan cards "procesos").
 *
 * ⚠ Correr ANTES de `migrate-canvas-reorg.ts` (que borra el Resumen y descarta
 *   las otras 3 secciones de cards).
 *
 * FOLLOW-UP (no en este round): el agente del grupo `preparacion` todavía emite
 * cards legacy a canvasSection="procesos". Para que su salida FUTURA aparezca en
 * la pestaña Procesos hay que migrarlo a block-format y rutearlo al canvas de
 * Información del cliente. Esto solo migra lo EXISTENTE.
 *
 * Uso:
 *   npx tsx scripts/migrate-procesos-to-blocks.ts           # dry-run
 *   npx tsx scripts/migrate-procesos-to-blocks.ts --apply
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

const SENTINEL = "__strategy__";
const CANVAS_NAME = "Información del cliente";
const INFO_SECTIONS = [
  { key: "stakeholders", label: "Stakeholders" },
  { key: "retos_estrategicos", label: "Retos Estratégicos" },
  { key: "oportunidades", label: "Oportunidades" },
  { key: "procesos", label: "Procesos" },
];

/** Devuelve el id de la sección "procesos" del canvas Información del cliente,
 *  creando project/canvas/secciones si faltan (replica ensureClientInfoProject). */
async function ensureProcesosSection(clientId: string): Promise<string> {
  let project = await prisma.project.findFirst({
    where: { clientId, serviceType: SENTINEL },
    select: { id: true },
  });
  if (!project) {
    project = await prisma.project.create({
      data: { clientId, name: CANVAS_NAME, serviceType: SENTINEL, projectType: "USE_CASE", status: "active" },
      select: { id: true },
    });
  }
  let canvas = await prisma.projectCanvas.findFirst({
    where: { projectId: project.id, name: CANVAS_NAME },
    select: { id: true },
  });
  if (!canvas) {
    canvas = await prisma.projectCanvas.create({
      data: { projectId: project.id, name: CANVAS_NAME, isDefault: false },
      select: { id: true },
    });
  }
  await prisma.canvasSection.createMany({
    data: INFO_SECTIONS.map((s, i) => ({ canvasId: canvas!.id, key: s.key, label: s.label, order: i })),
    skipDuplicates: true,
  });
  const procesos = await prisma.canvasSection.findUnique({
    where: { canvasId_key: { canvasId: canvas.id, key: "procesos" } },
    select: { id: true },
  });
  return procesos!.id;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Modo: ${apply ? "APLICAR" : "DRY-RUN (--apply para ejecutar)"}\n`);

  const cards = await prisma.clientContextCard.findMany({
    where: { canvasSection: "procesos" },
    select: {
      id: true, clientId: true, cardType: true, title: true, content: true,
      diagramData: true, chartConfig: true, canvasStatus: true,
    },
  });
  console.log(`Cards "procesos" a migrar: ${cards.length}\n`);
  if (cards.length === 0) {
    console.log("Nada que migrar.");
    return;
  }

  const byClient = new Map<string, typeof cards>();
  for (const c of cards) {
    if (!byClient.has(c.clientId)) byClient.set(c.clientId, []);
    byClient.get(c.clientId)!.push(c);
  }

  let migrated = 0;
  for (const [clientId, clientCards] of byClient) {
    console.log(`• cliente ${clientId}: ${clientCards.length} card(s)`);
    if (!apply) {
      migrated += clientCards.length;
      continue;
    }
    const sectionId = await ensureProcesosSection(clientId);
    let order = await prisma.canvasBlock.count({ where: { sectionId } });
    for (const card of clientCards) {
      const status: "CONFIRMED" | "DRAFT" = card.canvasStatus === "confirmed" ? "CONFIRMED" : "DRAFT";
      let blockType: "TEXT" | "FLOWCHART" | "CHART" = "TEXT";
      let content: string | null = null;
      let data: unknown = undefined;
      if (card.cardType === "FLOWCHART") {
        blockType = "FLOWCHART";
        content = card.title || null;
        data = card.diagramData ?? undefined;
      } else if (card.cardType === "CHART") {
        blockType = "CHART";
        content = card.title || null;
        data = card.chartConfig ?? undefined;
      } else {
        blockType = "TEXT";
        const prefix = card.title?.trim() ? `**${card.title.trim()}**\n\n` : "";
        content = prefix + (card.content ?? "");
      }
      await prisma.canvasBlock.create({
        data: {
          sectionId,
          blockType,
          content,
          ...(data !== undefined && data !== null ? { data: data as object } : {}),
          order: order++,
          source: "AGENT",
          status,
        },
      });
      await prisma.clientContextCard.delete({ where: { id: card.id } });
      migrated++;
    }
  }

  console.log(`\n${apply ? "Migradas" : "Se migrarían"}: ${migrated} cards → bloques en la sección procesos.`);
  if (!apply) console.log("⚠ Dry-run. Re-correr con --apply (ANTES de migrate-canvas-reorg).");
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
