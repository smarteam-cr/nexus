/**
 * scripts/update-mapeo-agent.ts
 *
 * Aplica a la DB viva el prompt VIGENTE del agente de mapeo de procesos.
 * El contenido vive en lib/agents/mapeo-prompt.ts (fuente única, compartida con
 * prisma/seed.ts para que un re-seed no revierta el prompt curado).
 *
 * Correr: npx tsx scripts/update-mapeo-agent.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import {
  MAPEO_SYSTEM_PROMPT,
  MAPEO_ADDITIONAL_INSTRUCTIONS,
  MAPEO_DESCRIPTION,
} from "../lib/agents/mapeo-prompt";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.agent.update({
    where: { id: "agent-mapeo-inicial" },
    data: {
      systemPrompt: MAPEO_SYSTEM_PROMPT,
      additionalInstructions: MAPEO_ADDITIONAL_INSTRUCTIONS,
      description: MAPEO_DESCRIPTION,
    },
  });
  console.log("✓ Actualizado: Mapeo de procesos (v4.1 — nodo 'info' con el resumen DENTRO de cada diagrama; card = índice + puntos ciegos)");

  await prisma.$disconnect();
  await pool.end();
}

main();
