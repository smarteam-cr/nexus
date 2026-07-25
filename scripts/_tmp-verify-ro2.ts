/** SOLO LECTURA. ¿Por qué hay 5 candidatos y no 25? */
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
};

async function main() {
  for (const [slug, key] of Object.entries(PORTADAS)) {
    const bloques = await prisma.canvasBlock.findMany({
      where: { section: { key, canvas: { slug, projectId: { not: null } } } },
      select: {
        id: true, data: true, previousData: true, blockType: true, status: true, order: true, source: true, createdAt: true,
        section: { select: { id: true, canvas: { select: { name: true, project: { select: { name: true } } } } } },
      },
      orderBy: { id: "asc" },
    });
    console.log(`\n######## ${slug} (${bloques.length} bloques en la sección de portada)`);
    for (const b of bloques) {
      const d = (b.data ?? {}) as Record<string, unknown>;
      const t = (k: string) => (typeof d[k] === "string" ? (d[k] as string).trim() : "");
      const prev = (b.previousData ?? null) as Record<string, unknown> | null;
      const prevTitulo = prev && typeof prev.titulo === "string" ? prev.titulo : null;
      console.log(
        `  · ${b.section.canvas.project?.name} | ${b.blockType}/${b.status}/ord=${b.order}/src=${b.source} | creado=${b.createdAt.toISOString().slice(0, 16)}`,
      );
      console.log(`      titulo   = ${JSON.stringify(t("titulo"))} (${t("titulo").length})`);
      console.log(`      headline = ${JSON.stringify(t("headline").slice(0, 90))} (${t("headline").length})`);
      console.log(`      subhead  = ${JSON.stringify(t("subhead").slice(0, 60))} (${t("subhead").length})`);
      console.log(`      previousData? ${prev ? `sí (titulo=${JSON.stringify(prevTitulo)})` : "no"}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
