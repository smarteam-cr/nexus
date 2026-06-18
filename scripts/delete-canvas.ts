/**
 * scripts/delete-canvas.ts
 *
 * Borra un canvas custom de un cliente (op puntual, replica la lógica del
 * endpoint DELETE /api/projects/[projectId]/canvases/[canvasId]: mueve las cards
 * fuera del canvas y luego lo borra; CanvasSection/CanvasBlock caen por cascada).
 *
 * Default: cliente "wherex", canvas "test". Override por args:
 *   npx tsx scripts/delete-canvas.ts [clienteTerm] [canvasName]
 * Dry-run por default. Aplicar con --apply:
 *   npx tsx scripts/delete-canvas.ts wherex test --apply
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const args = process.argv.slice(2).filter((a) => a !== "--apply");
const APPLY = process.argv.includes("--apply");
const CLIENT_TERM = args[0] ?? "wherex";
const CANVAS_NAME = args[1] ?? "test";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(APPLY ? "APLICANDO borrado de canvas…\n" : "DRY-RUN (usá --apply para borrar)\n");
  console.log(`Cliente ~ "${CLIENT_TERM}"  ·  canvas == "${CANVAS_NAME}"\n`);

  const matches = await prisma.projectCanvas.findMany({
    where: {
      name: CANVAS_NAME,
      project: {
        OR: [
          { name: { contains: CLIENT_TERM, mode: "insensitive" } },
          { client: { name: { contains: CLIENT_TERM, mode: "insensitive" } } },
        ],
      },
    },
    select: {
      id: true,
      name: true,
      isDefault: true,
      project: { select: { id: true, name: true, client: { select: { name: true } } } },
      _count: { select: { cards: true, canvasSections: true } },
    },
  });

  if (matches.length === 0) {
    console.log("No se encontró ningún canvas con ese nombre para ese cliente. Nada que borrar.");
    return;
  }

  for (const c of matches) {
    console.log(
      `• ${c.project.client?.name ?? "?"} / ${c.project.name} → canvas "${c.name}"` +
      `${c.isDefault ? " [DEFAULT]" : ""}  (cards=${c._count.cards}, secciones=${c._count.canvasSections})  ${c.id}`,
    );
  }

  if (matches.length > 1) {
    console.log(`\n⚠ Hay ${matches.length} coincidencias. Aborto por seguridad — acotá el término del cliente.`);
    return;
  }

  const canvas = matches[0];
  if (canvas.isDefault) {
    console.log("\n⚠ El canvas es DEFAULT (ancla) — no se puede borrar. Aborto.");
    return;
  }

  if (!APPLY) {
    console.log("\n(DRY-RUN) Se movería(n) las cards fuera del canvas y se borraría la fila. Usá --apply.");
    return;
  }

  await prisma.clientContextCard.updateMany({
    where: { canvasId: canvas.id },
    data: { canvasId: null, canvasSection: null, canvasOrder: null },
  });
  await prisma.projectCanvas.delete({ where: { id: canvas.id } });
  console.log(`\n✓ Canvas "${canvas.name}" borrado.`);
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
