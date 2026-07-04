/**
 * scripts/seed-buyer-personas.ts
 *
 * Siembra los buyer personas de Smarteam (idempotente por NOMBRE: no duplica ni
 * pisa ediciones manuales — si ya existe una persona con ese name, la salta).
 * Fuente: PERSONAS_SEED en lib/marketing/seed-data.ts.
 *
 * DRY-RUN por default (solo imprime qué haría). Escribe SOLO con --apply
 * (invariante 3: .env apunta a PROD, toda escritura se revisa antes de aplicar).
 *
 * Uso:
 *   npx tsx scripts/seed-buyer-personas.ts            # dry-run
 *   npx tsx scripts/seed-buyer-personas.ts --apply    # aplica
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import { PERSONAS_SEED } from "../lib/marketing/seed-data";

const APPLY = process.argv.includes("--apply");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(`Modo: ${APPLY ? "APPLY (escribe)" : "DRY-RUN (no escribe)"}\n`);

  const existing = await prisma.buyerPersona.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  const maxOrder = (await prisma.buyerPersona.aggregate({ _max: { order: true } }))._max.order ?? -1;

  let order = maxOrder;
  let toCreate = 0;
  for (const p of PERSONAS_SEED) {
    const exists = existingNames.has(p.name.trim().toLowerCase());
    if (exists) {
      console.log(`• "${p.name}" — ya existe, se salta.`);
      continue;
    }
    order += 1;
    toCreate += 1;
    console.log(`+ "${p.name}"  [${p.role}]  (order=${order})`);
    console.log(`    descripción: ${p.description.slice(0, 90)}…`);
    console.log(`    dolores:     ${p.pains.slice(0, 90)}…`);
    console.log(`    objetivos:   ${p.goals.slice(0, 90)}…`);
    if (APPLY) {
      await prisma.buyerPersona.create({
        data: {
          name: p.name,
          role: p.role,
          description: p.description,
          pains: p.pains,
          goals: p.goals,
          active: true,
          order,
        },
      });
    }
  }

  console.log(
    `\n${APPLY ? "✓ Aplicado" : "Dry-run"}: ${toCreate} persona(s) ${APPLY ? "creada(s)" : "a crear"}, ${PERSONAS_SEED.length - toCreate} ya existía(n).`,
  );
  if (!APPLY && toCreate > 0) console.log("Corré con --apply para escribir.");
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
