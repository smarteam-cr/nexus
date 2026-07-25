/**
 * scripts/verify-piece-slugs.ts — VERIFICACIÓN de la identidad de pieza (F1).
 *
 * Responde tres preguntas contra la base REAL (la misma que usan las dos PC y prod):
 *   1. ¿Todos los canvases resuelven a una pieza del registro? (ninguno huérfano)
 *   2. ¿Las consultas duales `canvasOf(slug)` encuentran EXACTAMENTE lo mismo que
 *      encontraba el lookup viejo por nombre? Si acá aparece una diferencia, algún
 *      camino del producto (permiso, vista externa, contexto de agente) va a ver
 *      menos —o más— de lo que veía ayer.
 *   3. ¿Hay canvases custom que se llamen como una pieza? Esos entran en la consulta
 *      dual por el respaldo por nombre — hay que saberlo, no descubrirlo en vivo.
 *
 * Solo lee. Correr con: npx tsx scripts/verify-piece-slugs.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import { PIECES, pieceForCanvas } from "../lib/pieces/registry";
import { canvasOf } from "../lib/pieces/canvas-query";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const todos = await prisma.projectCanvas.findMany({
    select: { id: true, slug: true, name: true, businessCaseId: true, projectId: true },
  });
  console.log(`Canvases en la base: ${todos.length}`);

  // ── 1. Huérfanos ───────────────────────────────────────────────────────────
  const huerfanos = todos.filter((c) => !pieceForCanvas(c));
  console.log(`\n1) Sin pieza: ${huerfanos.length}`);
  for (const c of huerfanos.slice(0, 20)) {
    console.log(`   - "${c.name}" (slug=${c.slug ?? "null"}, proyecto=${c.projectId ?? "-"})`);
  }
  if (huerfanos.length > 20) console.log(`   ... y ${huerfanos.length - 20} más`);

  // ── 2. Consulta dual vs lookup viejo ───────────────────────────────────────
  console.log("\n2) canvasOf(slug) vs name viejo");
  let diferencias = 0;
  for (const p of PIECES) {
    if (p.legacyNames.length === 0) continue; // business-case: nunca se buscó por nombre
    const [porSlug, porNombre] = await Promise.all([
      prisma.projectCanvas.count({ where: canvasOf(p.slug) }),
      prisma.projectCanvas.count({ where: { name: { in: p.legacyNames } } }),
    ]);
    const marca = porSlug === porNombre ? "OK " : "DIF";
    if (porSlug !== porNombre) diferencias++;
    console.log(`   ${marca} ${p.slug.padEnd(18)} slug=${porSlug}  name=${porNombre}`);
  }

  // ── 3. Canvases custom con nombre de pieza ─────────────────────────────────
  const nombres = new Set(PIECES.flatMap((p) => p.legacyNames));
  const shadow = todos.filter((c) => !c.slug && nombres.has(c.name));
  console.log(`\n3) Canvases sin slug con nombre de pieza (entran por el respaldo): ${shadow.length}`);
  for (const c of shadow.slice(0, 10)) console.log(`   - "${c.name}" proyecto=${c.projectId ?? "-"}`);

  const ok = huerfanos.length === 0 && diferencias === 0;
  console.log(`\n${ok ? "VERIFICACIÓN OK" : "REVISAR: hay diferencias"}`);
  process.exit(ok ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
