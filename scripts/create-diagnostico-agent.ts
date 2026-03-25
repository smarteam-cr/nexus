import { PrismaClient } from "@prisma/client";
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

async function main() {
  const promptPath = resolve(__dirname, "diagnostico-prompt.txt");
  const systemPrompt = readFileSync(promptPath, "utf-8").trim();

  const agent = await prisma.agent.upsert({
    where: { id: "agent-diagnostico-marketing" },
    create: {
      id: "agent-diagnostico-marketing",
      name: "Informe de diagnóstico de marketing",
      description:
        "Diagnóstico completo de la operación de marketing: funnel, KPIs, data, proceso teórico vs real, roles, brechas y escala de rendimiento. Genera 8 cards + flowcharts por proceso.",
      systemPrompt,
      status: "ACTIVE",
      associatedStages: [1],
      associatedStep: 2,
      sectionLabel: "Informe de diagnóstico",
      outputType: "CARDS_AND_FLOWCHARTS",
      scope: "CLIENT",
      agentType: "SECTION",
    },
    update: {
      name: "Informe de diagnóstico de marketing",
      description:
        "Diagnóstico completo de la operación de marketing: funnel, KPIs, data, proceso teórico vs real, roles, brechas y escala de rendimiento. Genera 8 cards + flowcharts por proceso.",
      systemPrompt,
      status: "ACTIVE",
      associatedStages: [1],
      associatedStep: 2,
      sectionLabel: "Informe de diagnóstico",
      outputType: "CARDS_AND_FLOWCHARTS",
      scope: "CLIENT",
      agentType: "SECTION",
    },
  });

  console.log("Upserted agent:", agent.id, "-", agent.name);
  await prisma.$disconnect();
  await pool.end();
}

main();
