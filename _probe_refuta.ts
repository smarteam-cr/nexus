import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 });
const prisma = new PrismaClient({ adapter });

const FIX = new Date("2026-07-07T21:42:52Z");
const now = new Date();
const manana = new Date(Date.now() + 24*3600*1000);
const dosDias = new Date(Date.now() + 48*3600*1000);

async function main() {
  // 1. Las lejanas (>2027)
  const lejanas = await prisma.firefliesSession.findMany({
    where: { date: { gt: new Date("2027-06-01") } },
    select: { id:true, title:true, date:true, syncedAt:true, updatedAt:true, source:true,
      googleEventId:true, googleDocId:true, resolvedClientId:true, manualClientId:true,
      manualClientSource:true, manualClientBy:true, transcript:true, summary:true, enrichedAt:true },
    orderBy: { date: "asc" },
  });
  console.log("== LEJANAS (date > 2027-06-01):", lejanas.length);
  for (const s of lejanas) {
    console.log(` ${s.date.toISOString().slice(0,10)} | sync ${s.syncedAt.toISOString()} | upd ${s.updatedAt.toISOString()} | src=${s.source} | evId=${s.googleEventId?.slice(0,28)} | doc=${s.googleDocId?"SI":"no"} | resolved=${s.resolvedClientId} | manual=${s.manualClientId} src=${s.manualClientSource} by=${s.manualClientBy} | txt=${s.transcript?s.transcript.length:0} sum=${s.summary?"SI":"no"} | "${s.title}"`);
  }

  // 2. Post-fix con date futura
  const postFix = await prisma.firefliesSession.count({ where: { date: { gt: manana }, syncedAt: { gt: FIX } } });
  const totalPostFix = await prisma.firefliesSession.count({ where: { syncedAt: { gt: FIX } } });
  const maxPostFix = await prisma.firefliesSession.findFirst({ where: { syncedAt: { gt: FIX } }, orderBy: { date: "desc" }, select: { date:true, title:true, syncedAt:true } });
  console.log(`\n== POST-FIX (syncedAt > ${FIX.toISOString()}): total=${totalPostFix}, con date>manana=${postFix}`);
  console.log(`   más lejana post-fix: ${maxPostFix?.date.toISOString()} "${maxPostFix?.title}" (sync ${maxPostFix?.syncedAt.toISOString()})`);

  // 2b. ¿y por updatedAt? (¿algo TOCÓ una fila futura post-fix?)
  const tocadasPostFix = await prisma.firefliesSession.count({ where: { date: { gt: manana }, updatedAt: { gt: FIX } } });
  console.log(`   filas futuras con updatedAt > fix: ${tocadasPostFix}`);

  // 3. distribución de futuras
  const futuras = await prisma.firefliesSession.findMany({
    where: { date: { gt: dosDias } }, select: { date:true, syncedAt:true }, orderBy: { date:"asc" } });
  const porAnio = new Map<number, number>();
  for (const f of futuras) porAnio.set(f.date.getUTCFullYear(), (porAnio.get(f.date.getUTCFullYear())??0)+1);
  console.log(`\n== FUTURAS (date > hoy+2d): ${futuras.length}`, [...porAnio.entries()].sort());
  const porSync = new Map<string, number>();
  for (const f of futuras) { const k = f.syncedAt.toISOString().slice(0,13); porSync.set(k,(porSync.get(k)??0)+1); }
  console.log("   por hora de syncedAt:", [...porSync.entries()].sort().slice(0,20));

  // 4. links de las lejanas
  const links = await prisma.sessionProject.findMany({
    where: { sessionId: { in: lejanas.map(s=>s.id) } },
    select: { sessionId:true, projectId:true, source:true, isPrimary:true, included:true, handoffOverride:true, confidence:true, createdAt:true,
      project: { select: { name:true, status:true, clientId:true } } },
  });
  console.log(`\n== LINKS de las lejanas: ${links.length}`);
  for (const l of links) console.log(`   ${l.sessionId.slice(0,26)} -> "${l.project.name}" [${l.project.status}] src=${l.source} prim=${l.isPrimary} incl=${l.included} conf=${l.confidence} ovr=${l.handoffOverride} created=${l.createdAt.toISOString()}`);
}
main().finally(()=>prisma.$disconnect());
