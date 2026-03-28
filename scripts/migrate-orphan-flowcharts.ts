/**
 * Migración: Crear ClientContextCard para flowcharts huérfanos.
 *
 * Busca AgentRuns con flowcharts en su output que NO tengan
 * un ClientContextCard de tipo FLOWCHART asociado, y los crea.
 *
 * Ejecución: npx tsx scripts/migrate-orphan-flowcharts.ts
 */

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

interface FlowchartItem {
  title?: string;
  description?: string;
  nodes: unknown[];
  edges: unknown[];
}

async function main() {
  console.log("=== Migración de flowcharts huérfanos ===\n");

  // 1. Buscar todos los AgentRun con status DONE que tienen output
  const runs = await prisma.agentRun.findMany({
    where: { status: "DONE", output: { not: null } },
    select: {
      id: true,
      clientId: true,
      projectId: true,
      output: true,
      agent: { select: { outputType: true } },
      cards: { select: { cardType: true }, where: { cardType: "FLOWCHART" } },
    },
  });

  console.log(`Encontrados ${runs.length} AgentRuns con output.\n`);

  let totalFlowchartsFound = 0;
  let totalCardsCreated = 0;
  let runsWithOrphans = 0;

  for (const run of runs) {
    // Si ya tiene cards FLOWCHART, no es huérfano
    if (run.cards.length > 0) continue;

    // Parsear el output
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(run.output as string);
    } catch {
      continue;
    }

    // Extraer flowcharts del output
    // Puede ser: { flowcharts: [...] } o { nodes: [...], edges: [...] } o { cards: [...], flowcharts: [...] }
    let flowcharts: FlowchartItem[] = [];

    if (Array.isArray(parsed.flowcharts)) {
      flowcharts = parsed.flowcharts.filter(
        (fc: FlowchartItem) => fc.nodes && Array.isArray(fc.nodes) && fc.nodes.length > 0
      );
    } else if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
      // Output es un solo flowchart
      flowcharts = [{
        title: parsed.title as string | undefined,
        description: parsed.description as string | undefined,
        nodes: parsed.nodes as unknown[],
        edges: (parsed.edges as unknown[]) ?? [],
      }];
    }

    if (flowcharts.length === 0) continue;

    totalFlowchartsFound += flowcharts.length;
    runsWithOrphans++;

    // Contar cards TEXT existentes para no pisarles el order
    const existingTextCards = await prisma.clientContextCard.count({
      where: { agentRunId: run.id, cardType: "TEXT" },
    });

    console.log(`  Run ${run.id}: ${flowcharts.length} flowchart(s) huérfano(s)`);

    // Crear cards FLOWCHART
    for (let i = 0; i < flowcharts.length; i++) {
      const fc = flowcharts[i];
      await prisma.clientContextCard.create({
        data: {
          clientId: run.clientId,
          projectId: run.projectId,
          agentRunId: run.id,
          title: fc.title?.trim() || `Diagrama de proceso ${i + 1}`,
          content: fc.description ?? "",
          order: existingTextCards + i,
          source: "AGENT",
          cardType: "FLOWCHART",
          diagramData: { nodes: fc.nodes, edges: fc.edges },
        },
      });
      totalCardsCreated++;
    }
  }

  console.log(`\n=== Resumen ===`);
  console.log(`AgentRuns con flowcharts huérfanos: ${runsWithOrphans}`);
  console.log(`Flowcharts encontrados: ${totalFlowchartsFound}`);
  console.log(`ClientContextCards creados: ${totalCardsCreated}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
