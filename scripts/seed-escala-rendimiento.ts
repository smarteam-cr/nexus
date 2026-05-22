/**
 * Seed: documento "Escala de Rendimiento Smarteam" en la base de conocimiento.
 *
 * Lee el contenido desde `scripts/data/escala_rendimiento.md` (fuente versionada
 * en el repo). Para actualizar el doc, reemplazá ese archivo y volvé a correr el seed.
 *
 * Uso: npx tsx scripts/seed-escala-rendimiento.ts
 *
 * Es idempotente: si ya existe un documento con el mismo título, lo actualiza
 * (sobre-escribe contenido, summary y tags). El campo `version` se bumpea solo
 * (lo maneja Prisma vía @updatedAt).
 */
import { PrismaClient, KnowledgeType, KnowledgeStatus, TagCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { readFileSync } from "fs";
import { resolve } from "path";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TITLE = "Escala de Rendimiento Smarteam";

const SUMMARY =
  "Instrumento de diagnóstico, posicionamiento y aceleración del rendimiento operacional en Marketing, Sales y Service. " +
  "Define 5 niveles (Deficiente → Óptimo) sobre 8 dimensiones por área (4 de Capacidad + 4 de Loop: Express/Tailor/Amplify/Evolve), " +
  "el marco de aceleración en 4 fases, la curva de rendimiento (no linealidad, impacto asimétrico de IA, target por tamaño), " +
  "el descriptor cualitativo de perfil multidimensional, y la metodología del test diagnóstico con 48 objetivos de información, " +
  "rúbricas por nivel y reglas de scoring.";

const TAGS: { category: TagCategory; value: string; label: string }[] = [
  { category: TagCategory.TOPIC,  value: "escala_rendimiento",   label: "Escala de Rendimiento" },
  { category: TagCategory.TOPIC,  value: "diagnostico_madurez",  label: "Diagnóstico de madurez" },
  { category: TagCategory.DOMAIN, value: "marketing",            label: "Marketing" },
  { category: TagCategory.DOMAIN, value: "sales",                label: "Ventas" },
  { category: TagCategory.DOMAIN, value: "service",              label: "Servicio al cliente" },
  { category: TagCategory.DOMAIN, value: "general",              label: "General" },
];

const CONTENT_PATH = resolve(__dirname, "data", "escala_rendimiento.md");
const CONTENT = readFileSync(CONTENT_PATH, "utf-8");

async function main() {
  console.log(`[seed-escala-rendimiento] Iniciando...`);
  console.log(`[seed-escala-rendimiento] Contenido leído de: ${CONTENT_PATH}`);
  console.log(`[seed-escala-rendimiento] Tamaño: ${CONTENT.length.toLocaleString()} chars`);

  // 1. Upsert de tags
  const tagIds: string[] = [];
  for (const t of TAGS) {
    const tag = await prisma.knowledgeTag.upsert({
      where:  { category_value: { category: t.category, value: t.value } },
      update: { label: t.label },
      create: { category: t.category, value: t.value, label: t.label },
    });
    tagIds.push(tag.id);
  }
  console.log(`[seed-escala-rendimiento] Tags asegurados: ${tagIds.length}`);

  // 2. Buscar documento existente por título
  const existing = await prisma.knowledgeDocument.findFirst({ where: { title: TITLE } });

  if (existing) {
    const updated = await prisma.knowledgeDocument.update({
      where: { id: existing.id },
      data: {
        type:    KnowledgeType.METHODOLOGY,
        status:  KnowledgeStatus.PUBLISHED,
        summary: SUMMARY,
        content: CONTENT,
        tags:    { set: tagIds.map((id) => ({ id })) },
      },
    });
    console.log(`[seed-escala-rendimiento] Actualizado: ${updated.id} — "${updated.title}" (v${updated.version})`);
  } else {
    const created = await prisma.knowledgeDocument.create({
      data: {
        type:    KnowledgeType.METHODOLOGY,
        status:  KnowledgeStatus.PUBLISHED,
        title:   TITLE,
        summary: SUMMARY,
        content: CONTENT,
        tags:    { connect: tagIds.map((id) => ({ id })) },
      },
    });
    console.log(`[seed-escala-rendimiento] Creado: ${created.id} — "${created.title}"`);
  }

  console.log(`[seed-escala-rendimiento] Listo.`);
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
