/**
 * scripts/migrate-dinterweb-to-smarteam.ts
 *
 * Migración one-off de datos legacy:
 *   1. TeamMember: emails @dinterweb.com → @smarteamcr.com (preservando prefijo)
 *   2. Client llamado "Dinterweb" → renombrado a "Demo Agency"
 *
 * Idempotente: se puede correr múltiples veces sin efecto adicional.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/migrate-dinterweb-to-smarteam.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const OLD_DOMAIN = "@dinterweb.com";
const NEW_DOMAIN = "@smarteamcr.com";

async function main() {
  console.log("🔄 Migración legacy dinterweb → smarteamcr.com\n");

  // ── 1. Migrar emails de TeamMember ──────────────────────────────────────────
  const members = await prisma.teamMember.findMany({
    where: { email: { endsWith: OLD_DOMAIN } },
    select: { id: true, name: true, email: true },
  });

  if (members.length === 0) {
    console.log(`✓ TeamMember: 0 registros con ${OLD_DOMAIN} (nada que migrar).`);
  } else {
    console.log(`→ TeamMember: ${members.length} registros con ${OLD_DOMAIN}\n`);
    for (const m of members) {
      const newEmail = m.email.replace(OLD_DOMAIN, NEW_DOMAIN);
      // Verificar que no exista ya el email nuevo (evitar conflicto de unique)
      const existing = await prisma.teamMember.findUnique({ where: { email: newEmail } });
      if (existing) {
        console.log(`  ⚠ ${m.name}: ${newEmail} ya existe (id ${existing.id}). Saltando.`);
        continue;
      }
      await prisma.teamMember.update({
        where: { id: m.id },
        data: { email: newEmail },
      });
      console.log(`  ✓ ${m.name}: ${m.email} → ${newEmail}`);
    }
  }

  // ── 2. Renombrar Client "Dinterweb" → "Demo Agency" ─────────────────────────
  const dinterwebClient = await prisma.client.findFirst({
    where: { name: "Dinterweb" },
    select: { id: true, name: true, company: true },
  });

  if (!dinterwebClient) {
    console.log(`\n✓ Client: ningún Client con nombre "Dinterweb" (nada que migrar).`);
  } else {
    await prisma.client.update({
      where: { id: dinterwebClient.id },
      data: {
        name: "Demo Agency",
        company: dinterwebClient.company === "Dinterweb" ? "Demo Agency" : dinterwebClient.company,
      },
    });
    console.log(`\n✓ Client renombrado: "Dinterweb" → "Demo Agency" (id ${dinterwebClient.id})`);
  }

  // ── 3. Reporte de HubspotAccount con hubName que mencione dinterweb ─────────
  const dinterwebHubspot = await prisma.hubspotAccount.findMany({
    where: {
      OR: [
        { hubName: { contains: "dinterweb", mode: "insensitive" } },
      ],
    },
    select: { id: true, hubName: true, hubspotPortalId: true, isSystem: true },
  });

  if (dinterwebHubspot.length === 0) {
    console.log(`✓ HubspotAccount: 0 cuentas con "dinterweb" en hubName.`);
  } else {
    console.log(`\n⚠ HubspotAccount: ${dinterwebHubspot.length} cuenta(s) con "dinterweb" en hubName:`);
    for (const acc of dinterwebHubspot) {
      console.log(`  · id=${acc.id} hubName="${acc.hubName}" portal=${acc.hubspotPortalId} isSystem=${acc.isSystem}`);
    }
    console.log(`  (No se modifican automáticamente — son metadata de OAuth, requieren re-conexión manual del portal en HubSpot)`);
  }

  console.log("\n✅ Migración completada.");
}

main()
  .catch((err) => {
    console.error("❌ Error en migración:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
