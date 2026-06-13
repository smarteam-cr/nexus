/**
 * scripts/inspect-flowcharts.ts  (READ-ONLY)
 * ¿Se están diagramando procesos? Cuenta los diagramas de flujo existentes:
 *   - Legacy:  ClientContextCard.cardType = FLOWCHART  (diagramData = { nodes, edges })
 *   - Nuevo:   CanvasBlock.blockType    = FLOWCHART    (data        = { nodes, edges })
 * Agrupa por cliente y marca si el diagrama tiene nodos (no vacío).
 * Uso: npx tsx scripts/inspect-flowcharts.ts [filtroNombreCliente]
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function nodeCount(d: unknown): number {
  if (d && typeof d === "object" && Array.isArray((d as { nodes?: unknown[] }).nodes)) {
    return (d as { nodes: unknown[] }).nodes.length;
  }
  return 0;
}

async function main() {
  const term = process.argv[2] ?? "";
  const clientFilter = term ? { name: { contains: term, mode: "insensitive" as const } } : undefined;

  const cards = await prisma.clientContextCard.findMany({
    where: { cardType: "FLOWCHART", ...(clientFilter ? { client: clientFilter } : {}) },
    select: { id: true, title: true, diagramData: true, createdAt: true, client: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const blocks = await prisma.canvasBlock.findMany({
    where: { blockType: "FLOWCHART", ...(clientFilter ? { section: { canvas: { project: { client: clientFilter } } } } : {}) },
    select: {
      id: true, data: true, status: true, createdAt: true,
      section: { select: { label: true, canvas: { select: { name: true, project: { select: { name: true, client: { select: { name: true } } } } } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Agrupar por cliente
  type Row = { cards: number; cardsConNodos: number; blocks: number; blocksConNodos: number; detalle: string[] };
  const byClient = new Map<string, Row>();
  const get = (name: string): Row => {
    if (!byClient.has(name)) byClient.set(name, { cards: 0, cardsConNodos: 0, blocks: 0, blocksConNodos: 0, detalle: [] });
    return byClient.get(name)!;
  };

  for (const c of cards) {
    const r = get(c.client.name);
    r.cards++;
    const n = nodeCount(c.diagramData);
    if (n > 0) r.cardsConNodos++;
    r.detalle.push(`  [card]  "${c.title}" — ${n} nodos · ${c.createdAt.toISOString().slice(0, 10)}`);
  }
  for (const b of blocks) {
    const name = b.section?.canvas?.project?.client?.name ?? "(sin cliente)";
    const r = get(name);
    r.blocks++;
    const n = nodeCount(b.data);
    if (n > 0) r.blocksConNodos++;
    const where = `${b.section?.canvas?.project?.name ?? "?"} › ${b.section?.canvas?.name ?? "?"} › ${b.section?.label ?? "?"}`;
    r.detalle.push(`  [block] ${where} — ${n} nodos · ${b.status} · ${b.createdAt.toISOString().slice(0, 10)}`);
  }

  console.log(`\n══ Diagramas de proceso (FLOWCHART) ${term ? `· filtro "${term}"` : "· TODOS los clientes"} ══`);
  console.log(`Totales: ${cards.length} card(s) legacy + ${blocks.length} bloque(s) nuevos = ${cards.length + blocks.length} diagrama(s)\n`);

  if (byClient.size === 0) {
    console.log("⚠️  No hay ningún diagrama de proceso en la base todavía.");
  } else {
    for (const [name, r] of [...byClient.entries()].sort((a, b) => (b[1].cards + b[1].blocks) - (a[1].cards + a[1].blocks))) {
      console.log(`▸ ${name}: ${r.cards} card(s) (${r.cardsConNodos} con nodos) + ${r.blocks} bloque(s) (${r.blocksConNodos} con nodos)`);
      for (const d of r.detalle) console.log(d);
      console.log("");
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
