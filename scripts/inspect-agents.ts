/**
 * scripts/inspect-agents.ts
 *
 * Diagnóstico read-only del catálogo de agentes: lista cada agente con su
 * agentGroup / agentType / outputType / status y nº de ejecuciones (runs).
 * Sirve para auditar duplicados, huérfanos y agentes sin uso.
 *
 * Uso: npx tsx scripts/inspect-agents.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const agents = await prisma.agent.findMany({
    orderBy: [{ agentGroup: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, agentGroup: true, agentType: true,
      outputType: true, status: true, _count: { select: { runs: true } },
    },
  });
  for (const a of agents) {
    console.log(
      `${(a._count.runs + "").padStart(4)} runs | grp=${(a.agentGroup ?? "—").padEnd(14)} | ` +
        `type=${a.agentType.padEnd(18)} | out=${a.outputType.padEnd(22)} | ${a.status.padEnd(6)} | ` +
        `${a.id}  ::  ${a.name}`,
    );
  }
  console.log(`\nTOTAL: ${agents.length} agentes`);
}

main().catch(console.error).finally(async () => { await prisma.$disconnect(); await pool.end(); });
