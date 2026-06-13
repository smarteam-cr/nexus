/**
 * scripts/inspect-spectrum-run.ts  (READ-ONLY)
 * Inspecciona las últimas corridas de agente de un cliente + qué produjeron.
 * Sirve para diagnosticar: ¿el agente corrió server-side? ¿quedó FAILED? ¿generó cards/blocks?
 * Uso: npx tsx scripts/inspect-spectrum-run.ts [filtroNombreCliente]
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const term = process.argv[2] ?? "spectrum";
  const client = await prisma.client.findFirst({ where: { name: { contains: term, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!client) { console.log(`No se encontró cliente "${term}"`); return; }
  console.log(`\n══ ${client.name} [${client.id}] ══\n`);

  const runs = await prisma.agentRun.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true, agentId: true, status: true, stage: true, step: true, stepLabel: true, sectionLabel: true,
      createdAt: true, updatedAt: true, output: true,
      agent: { select: { name: true, outputType: true } },
      _count: { select: { cards: true, blocks: true } },
    },
  });

  console.log(`Últimas ${runs.length} corridas de agente:\n`);
  for (const r of runs) {
    const dur = Math.round((r.updatedAt.getTime() - r.createdAt.getTime()) / 1000);
    console.log(`▸ ${r.agent?.name ?? r.agentId ?? "(sin agente)"}  [${r.id}]`);
    console.log(`    status: ${r.status}   outputType: ${r.agent?.outputType ?? "?"}   etapa/paso: ${r.stage ?? "—"}/${r.step ?? "—"} ${r.stepLabel ? `(${r.stepLabel})` : ""}`);
    console.log(`    creado: ${r.createdAt.toISOString().slice(0, 19)}   dur: ~${dur}s   cards: ${r._count.cards}   blocks: ${r._count.blocks}`);
    if (r.output) {
      const head = r.output.slice(0, 180).replace(/\s+/g, " ");
      console.log(`    output[0..180]: ${head}${r.output.length > 180 ? "…" : ""}  (len=${r.output.length})`);
    } else {
      console.log(`    output: (vacío)`);
    }
    console.log("");
  }

  // Flowcharts del cliente (cards legacy + blocks nuevos)
  const fcCards = await prisma.clientContextCard.count({ where: { clientId: client.id, cardType: "FLOWCHART" } });
  const fcCardsCanvas = await prisma.clientContextCard.findMany({
    where: { clientId: client.id, cardType: "FLOWCHART" },
    select: { id: true, title: true, canvasId: true, canvasSection: true, canvasStatus: true, createdAt: true },
    orderBy: { createdAt: "desc" }, take: 10,
  });
  const fcBlocks = await prisma.canvasBlock.findMany({
    where: { blockType: "FLOWCHART", section: { canvas: { project: { clientId: client.id } } } },
    select: { id: true, status: true, createdAt: true, section: { select: { label: true, key: true, canvas: { select: { name: true, project: { select: { name: true } } } } } } },
    orderBy: { createdAt: "desc" }, take: 10,
  });

  console.log(`── Diagramas FLOWCHART de ${client.name} ──`);
  console.log(`Cards legacy: ${fcCards}`);
  for (const c of fcCardsCanvas) {
    console.log(`  [card]  "${c.title}" — canvasId:${c.canvasId ?? "—"} section:${c.canvasSection ?? "—"} status:${c.canvasStatus} · ${c.createdAt.toISOString().slice(0, 19)}`);
  }
  console.log(`Blocks nuevos: ${fcBlocks.length}`);
  for (const b of fcBlocks) {
    console.log(`  [block] ${b.section?.canvas?.project?.name ?? "?"} › ${b.section?.canvas?.name ?? "?"} › ${b.section?.label ?? "?"} (key:${b.section?.key ?? "?"}) status:${b.status} · ${b.createdAt.toISOString().slice(0, 19)}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
