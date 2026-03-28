import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Mapeo de agentes existentes a grupos
const AGENT_GROUP_MAP: Record<string, { group: string; order: number }> = {
  // Preparación (order 0) — Stage 1, Steps 0-1
  "cmmla1g1x00005wijix3qnr7u": { group: "preparacion", order: 0 },  // Análisis inicial
  "cmmwxty5k0000u0ijzf2hkqx2": { group: "preparacion", order: 0 },  // Preparación para el Kick-off
  "agent-mapeo-inicial":        { group: "preparacion", order: 0 },  // Mapeo inicial de procesos
  "agent-entrevistas-prep":     { group: "preparacion", order: 0 },  // Preparación de entrevistas

  // Diagnóstico (order 1) — Stage 1, Step 2
  "agent-diagnostico-marketing": { group: "diagnostico", order: 1 }, // Informe de diagnóstico de marketing

  // Canvas agents (transversales — no tienen grupo visible)
  "cmn4q38e1000198iijp7eid7b":  { group: "preparacion", order: 0 }, // Canvas de empresa
  "cmn4q2yv7000098iiyoecpffs":  { group: "preparacion", order: 0 }, // Canvas de proyecto
};

async function main() {
  const agents = await prisma.agent.findMany({ select: { id: true, name: true, agentGroup: true } });

  let updated = 0;
  for (const agent of agents) {
    const mapping = AGENT_GROUP_MAP[agent.id];
    if (mapping) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { agentGroup: mapping.group, groupOrder: mapping.order },
      });
      console.log(`✓ ${agent.name} → ${mapping.group} (order ${mapping.order})`);
      updated++;
    } else {
      console.log(`⚠ ${agent.name} — sin mapeo, dejado como está`);
    }
  }

  // Delete the old draft wildcard agent
  try {
    await prisma.agent.delete({ where: { id: "cmmu16uhu0000k8ij0wvs93z2" } });
    console.log("✓ Eliminado: Agente de Kickoff (borrador wildcard)");
  } catch {
    console.log("⚠ Agente de Kickoff ya no existe");
  }

  console.log(`\nMigrados: ${updated} agentes`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
