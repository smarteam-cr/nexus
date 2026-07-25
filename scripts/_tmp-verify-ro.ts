/** SOLO LECTURA. Verifica los hallazgos de los revisores contra la base. */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const PORTADAS: Record<string, string> = {
  kickoff: "bienvenida",
  "tech-requirements": "requerimiento",
  exploration: "exploracion",
  diagnosis: "diagnostico",
  planning: "planificacion",
  implementation: "implementacion",
};

async function main() {
  let total = 0;
  const dupRisk: string[] = [];
  for (const [slug, key] of Object.entries(PORTADAS)) {
    // Réplica EXACTA del where del script
    const bloques = await prisma.canvasBlock.findMany({
      where: { section: { key, canvas: { slug, projectId: { not: null } } } },
      select: {
        id: true, data: true, blockType: true, status: true, order: true,
        section: {
          select: {
            id: true, titleOverride: true,
            canvas: {
              select: {
                id: true, name: true, slug: true, contentUpdatedAt: true, publishedSnapshotAt: true,
                publishedSnapshot: true,
                project: { select: { name: true, kickoffPublishedAt: true, desarrolloPublishedAt: true } },
              },
            },
          },
        },
      },
    });
    // cuántos pasan el filtro del script
    const cand = bloques.filter((b) => {
      const d = (b.data ?? {}) as Record<string, unknown>;
      const t = (k: string) => (typeof d[k] === "string" ? (d[k] as string).trim() : "");
      return !t("titulo") && (t("headline") || t("subhead"));
    });
    total += cand.length;
    console.log(`\n### ${slug} — bloques en la sección: ${bloques.length} | candidatos: ${cand.length}`);
    // cuántos bloques por sección (riesgo de 2 CARDs)
    const porSeccion = new Map<string, number>();
    for (const b of bloques) porSeccion.set(b.section.id, (porSeccion.get(b.section.id) ?? 0) + 1);
    const multi = [...porSeccion.entries()].filter(([, n]) => n > 1);
    if (multi.length) console.log(`  ⚠ secciones con >1 bloque: ${multi.length}`);
    const cardsPorSeccion = new Map<string, number>();
    for (const b of bloques) if (b.blockType === "CARD") cardsPorSeccion.set(b.section.id, (cardsPorSeccion.get(b.section.id) ?? 0) + 1);
    const multiCard = [...cardsPorSeccion.entries()].filter(([, n]) => n > 1);
    if (multiCard.length) console.log(`  ⚠⚠ secciones con >1 CARD: ${multiCard.length}`);

    for (const b of cand) {
      const d = (b.data ?? {}) as Record<string, unknown>;
      const headline = typeof d.headline === "string" ? d.headline.trim() : "";
      const c = b.section.canvas;
      const pub = slug === "kickoff" ? c.project?.kickoffPublishedAt : slug === "tech-requirements" ? c.project?.desarrolloPublishedAt : null;
      const snapUsable = c.publishedSnapshot && typeof c.publishedSnapshot === "object";
      const dirty = !!c.contentUpdatedAt && (!c.publishedSnapshotAt || c.contentUpdatedAt > c.publishedSnapshotAt);
      console.log(
        `  · ${c.project?.name} | ${b.blockType}/${b.status}/ord=${b.order} | titleOverride=${JSON.stringify(b.section.titleOverride)} | headline(${headline.length})=${JSON.stringify(headline.slice(0, 70))}`,
      );
      console.log(
        `      publicado=${pub ? "SÍ" : "no"} | snapshotUsable=${snapUsable ? "sí" : "NO"} | dirty=${dirty} | contentUpdatedAt=${c.contentUpdatedAt?.toISOString() ?? "null"} | snapAt=${c.publishedSnapshotAt?.toISOString() ?? "null"}`,
      );
      if (headline && headline.length <= 60) dupRisk.push(`${c.project?.name}/${slug}: "${headline}" (${headline.length})`);
      const otras = Object.keys(d).filter((k) => !["headline", "subhead", "titulo"].includes(k));
      if (otras.length) console.log(`      otras claves: ${otras.join(", ")}`);
    }
  }
  console.log(`\n\nTOTAL CANDIDATOS = ${total}`);
  console.log(`\nHeadlines que YA caben en 60 (riesgo de que el modelo lo copie tal cual): ${dupRisk.length}`);
  for (const r of dupRisk) console.log(`  - ${r}`);

  // H8: ¿hay canvases de estos tipos con slug null (que el script se perdería)?
  const legacy = await prisma.projectCanvas.findMany({
    where: { slug: null, name: { in: ["Kickoff", "Desarrollo", "Exploración", "Diagnóstico", "Planificación", "Implementación"] }, projectId: { not: null } },
    select: { id: true, name: true },
  });
  console.log(`\nH8 — canvases con slug null y nombre legacy: ${legacy.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
