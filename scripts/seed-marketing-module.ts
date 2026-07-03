/**
 * scripts/seed-marketing-module.ts
 *
 * Siembra el módulo Marketing + Contenido (idempotente):
 *   1. MarketingSettings (singleton id="marketing") — brandVoice SOLO al crear
 *      (una re-corrida NO pisa la voz editada por el equipo).
 *   2. IcpItem — migra el ICP que vivía hardcodeado en app/icp/ICPSection.tsx,
 *      SOLO si la tabla está vacía (no resucita ítems borrados a mano).
 *   3. Agent "agent-marketing-contenido" — upsert; el prompt SÍ se actualiza en
 *      re-corridas (misma semántica que seed-kickoff-agent).
 *
 * Uso: npx tsx scripts/seed-marketing-module.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import {
  ICP_SEED,
  BRAND_VOICE_SEED,
  MARKETING_AGENT_PROMPT,
  MARKETING_AGENT_ID,
} from "../lib/marketing/seed-data";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  // 1. Settings singleton (brandVoice solo en create)
  const settings = await prisma.marketingSettings.upsert({
    where: { id: "marketing" },
    update: {},
    create: { id: "marketing", brandVoice: BRAND_VOICE_SEED },
  });
  console.log(`✓ MarketingSettings (voz: ${settings.brandVoice.slice(0, 50)}…)`);

  // 2. ICP — solo si la tabla está vacía
  const icpCount = await prisma.icpItem.count();
  if (icpCount === 0) {
    const rows = ICP_SEED.flatMap(({ section, items }) =>
      items.map((label, order) => ({ section, label, order })),
    );
    const created = await prisma.icpItem.createMany({ data: rows });
    console.log(`✓ IcpItem: ${created.count} ítems migrados desde el hardcode`);
  } else {
    console.log(`• IcpItem: ya hay ${icpCount} ítems — no se toca (borrados no se resucitan)`);
  }

  // 3. Agente de generación (upsert; prompt se actualiza en re-corridas)
  const agent = await prisma.agent.upsert({
    where: { id: MARKETING_AGENT_ID },
    update: {
      name: "Marketing — Ideas de contenido y campañas",
      description:
        "Genera ideas de contenido para redes e ideas de campañas de paid desde la inspiración de LinkedIn + los insumos de Marketing (ICP, personas, pilares, voz). Single-tenant.",
      systemPrompt: MARKETING_AGENT_PROMPT,
      status: "ACTIVE",
      scope: "GLOBAL",
      agentGroup: "marketing-contenido",
    },
    create: {
      id: MARKETING_AGENT_ID,
      name: "Marketing — Ideas de contenido y campañas",
      description:
        "Genera ideas de contenido para redes e ideas de campañas de paid desde la inspiración de LinkedIn + los insumos de Marketing (ICP, personas, pilares, voz). Single-tenant.",
      systemPrompt: MARKETING_AGENT_PROMPT,
      status: "ACTIVE",
      scope: "GLOBAL",
      agentGroup: "marketing-contenido",
    },
  });
  console.log(`✓ Agent "${agent.name}" (id=${agent.id}, status=${agent.status}, prompt ${agent.systemPrompt.length} chars)`);

  console.log("\nSembrado del módulo Marketing OK.");
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
