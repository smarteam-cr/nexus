/**
 * scripts/diag-piezas-opcionales.ts — DIAGNÓSTICO para F2 (piezas opcionales). SOLO LEE.
 *
 * Mide el problema real antes de tocar código:
 *   1. Qué piezas tiene HOY cada proyecto (la foto: ¿son de verdad los mismos 5 siempre?).
 *   2. El BUG concreto: proyectos con alcance técnico por tags que NO tienen la pieza
 *      técnica. Son los que hoy quedaron afuera para siempre porque la condición se
 *      evalúa una sola vez, durante el handoff.
 *   3. El caso inverso: proyectos con la pieza técnica pero SIN tags que la justifiquen
 *      (creada a mano o el tag se sacó después) — esos no se pueden apagar solos.
 *   4. Piezas vacías: canvas creado y nunca usado. Es la medida de cuánto ruido saca F2.
 *
 * Uso: npx tsx scripts/diag-piezas-opcionales.ts
 */
import { createScriptDb } from "./lib/db";
import { hasTechnicalScope } from "../lib/tags/catalog";
import { slugForCanvas, pieceLabel } from "../lib/pieces/registry";

// Presupuesto de conexiones ACOTADO (scripts/lib/db.ts): el pooler comparte ~15 slots
// con producción y las dos PCs de dev; un pool sin tope se comía 10 él solo.
const { prisma, close } = createScriptDb();

const SENTINEL = "__strategy__";

async function main() {
  const proyectos = await prisma.project.findMany({
    // OJO: `{ serviceType: { not: SENTINEL } }` a secas descarta también los proyectos con
    // serviceType NULL (semántica SQL de NULL), que son 44 y sí son proyectos reales.
    where: { NOT: { serviceType: SENTINEL } },
    select: {
      id: true,
      name: true,
      tags: true,
      createdAt: true,
      client: { select: { name: true } },
      canvases: {
        select: {
          id: true,
          slug: true,
          name: true,
          _count: { select: { canvasSections: true } },
        },
      },
    },
  });
  console.log(`Proyectos reales (sin __strategy__): ${proyectos.length}\n`);

  // ── 1. Foto de piezas por proyecto ─────────────────────────────────────────
  const conteoPorPieza = new Map<string, number>();
  const combos = new Map<string, number>();
  for (const p of proyectos) {
    const slugs = p.canvases.map((c) => slugForCanvas(c)).filter((s): s is string => !!s).sort();
    for (const s of slugs) conteoPorPieza.set(s, (conteoPorPieza.get(s) ?? 0) + 1);
    const combo = slugs.join("+") || "(ninguna)";
    combos.set(combo, (combos.get(combo) ?? 0) + 1);
  }
  console.log("1) Piezas por proyecto");
  for (const [slug, n] of [...conteoPorPieza].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(3)}/${proyectos.length}  ${pieceLabel(slug)} (${slug})`);
  }
  console.log("\n   Combinaciones distintas de piezas:");
  for (const [combo, n] of [...combos].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(3)}×  ${combo}`);
  }

  // ── 2. El bug: alcance técnico sin la pieza ────────────────────────────────
  const sinPiezaTecnica = proyectos.filter(
    (p) => hasTechnicalScope(p.tags ?? []) && !p.canvases.some((c) => slugForCanvas(c) === "tech-requirements"),
  );
  console.log(`\n2) CON alcance técnico y SIN la pieza técnica: ${sinPiezaTecnica.length}`);
  for (const p of sinPiezaTecnica) {
    console.log(`   - ${p.client?.name ?? "?"} / ${p.name}  tags=[${(p.tags ?? []).join(", ")}]`);
  }

  // ── 3. El inverso: pieza técnica sin tags que la justifiquen ───────────────
  const conPiezaSinTags = proyectos.filter(
    (p) => !hasTechnicalScope(p.tags ?? []) && p.canvases.some((c) => slugForCanvas(c) === "tech-requirements"),
  );
  console.log(`\n3) CON la pieza técnica y SIN tags técnicos: ${conPiezaSinTags.length}`);
  for (const p of conPiezaSinTags) {
    console.log(`   - ${p.client?.name ?? "?"} / ${p.name}  tags=[${(p.tags ?? []).join(", ")}]`);
  }

  // ── 4. Piezas creadas y nunca usadas ───────────────────────────────────────
  const canvasIds = proyectos.flatMap((p) => p.canvases.map((c) => c.id));
  const conBloques = new Set(
    (
      await prisma.canvasSection.findMany({
        where: { canvasId: { in: canvasIds }, blocks: { some: {} } },
        select: { canvasId: true },
        distinct: ["canvasId"],
      })
    ).map((s) => s.canvasId),
  );
  const vaciasPorPieza = new Map<string, number>();
  let vacias = 0;
  for (const p of proyectos) {
    for (const c of p.canvases) {
      if (conBloques.has(c.id)) continue;
      vacias++;
      const slug = slugForCanvas(c) ?? "(custom)";
      vaciasPorPieza.set(slug, (vaciasPorPieza.get(slug) ?? 0) + 1);
    }
  }
  console.log(`\n4) Canvases creados y NUNCA usados (0 bloques): ${vacias} de ${canvasIds.length}`);
  for (const [slug, n] of [...vaciasPorPieza].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(3)}  ${slug === "(custom)" ? "(custom del CSE)" : pieceLabel(slug)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => close());
