/**
 * scripts/check-logo-state.ts  (READ-ONLY)
 * Estado de logo + publicación para proyectos que matchean un término.
 * Uso: npx tsx scripts/check-logo-state.ts sinergy
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  // Clientes que YA tienen logo cargado (responde "¿se guardó?").
  const withLogo = await prisma.client.findMany({
    where: { logoUrl: { not: null } },
    select: { id: true, name: true, logoUrl: true },
  });
  console.log(`\n══ Clientes con logo cargado: ${withLogo.length} ══`);
  for (const c of withLogo) console.log(`  • ${c.name}  →  ${c.logoUrl}`);

  const term = process.argv[2] ?? "sinergy";
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { client: { name: { contains: term, mode: "insensitive" } } },
      ],
    },
    select: {
      id: true,
      name: true,
      kickoffPublishedAt: true,
      timelinePublishedAt: true,
      client: { select: { id: true, name: true, logoUrl: true } },
      externalAccess: { select: { revokedAt: true } },
    },
  });
  if (projects.length === 0) {
    console.log(`(sin proyectos para "${term}")`);
  }
  for (const p of projects) {
    console.log(`\n▸ Proyecto: ${p.name}  [${p.id}]`);
    console.log(`  Cliente: ${p.client?.name ?? "—"}  [${p.client?.id ?? "—"}]`);
    console.log(`  Client.logoUrl: ${p.client?.logoUrl ?? "NULL (no hay logo)"}`);
    console.log(`  kickoffPublishedAt:  ${p.kickoffPublishedAt ? p.kickoffPublishedAt.toISOString() : "NO publicado"}`);
    console.log(`  timelinePublishedAt: ${p.timelinePublishedAt ? p.timelinePublishedAt.toISOString() : "NO publicado"}`);
    const acc = p.externalAccess;
    console.log(`  Acceso externo: ${acc ? (acc.revokedAt ? "revocado" : "activo") : "no generado"}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
