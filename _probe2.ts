import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 });
const prisma = new PrismaClient({ adapter });
const FIX = new Date("2026-07-07T21:42:52Z");
const manana = new Date(Date.now() + 24*3600*1000);
const dosDias = new Date(Date.now() + 48*3600*1000);

async function main() {
  // A. reviewedAt / provenance de los links de las lejanas
  const lej = await prisma.firefliesSession.findMany({ where:{date:{gt:new Date("2027-06-01")}}, select:{id:true,date:true}});
  const links = await prisma.sessionProject.findMany({ where:{sessionId:{in:lej.map(s=>s.id)}},
    select:{sessionId:true,source:true,reviewedAt:true,handoffOverride:true,isPrimary:true}});
  console.log("A. links de lejanas por (source, reviewedAt null?, override):");
  const agg = new Map<string,number>();
  for (const l of links) { const k=`src=${l.source} reviewed=${l.reviewedAt?"SI":"null"} ovr=${l.handoffOverride}`; agg.set(k,(agg.get(k)??0)+1); }
  console.log([...agg.entries()]);
  console.log("   sessionIds distintos:", new Set(links.map(l=>l.sessionId)).size, "de", lej.length);

  // B. Las 442 futuras: ¿cuáles tienen razón de preservación?
  const fut = await prisma.firefliesSession.findMany({ where:{date:{gt:dosDias}},
    select:{id:true,date:true,syncedAt:true,manualClientId:true,transcript:true,summary:true,resolvedClientId:true}});
  const futIds = fut.map(f=>f.id);
  const conLink = new Set((await prisma.sessionProject.findMany({where:{sessionId:{in:futIds}},select:{sessionId:true}})).map(r=>r.sessionId));
  const conMin = new Set((await prisma.sessionMinute.findMany({where:{sessionId:{in:futIds}},select:{sessionId:true}})).map(r=>r.sessionId));
  const conAct = new Set((await prisma.actionItem.findMany({where:{sessionId:{in:futIds}},select:{sessionId:true}})).map(r=>r.sessionId!).filter(Boolean));
  let sinRazon=0, conRazon=0;
  const burst = fut.filter(f=>f.syncedAt.toISOString().startsWith("2026-07-07T15"));
  let burstSinRazon=0;
  for (const f of fut) {
    const razon = !!f.manualClientId || !!f.transcript || !!f.summary || conLink.has(f.id) || conMin.has(f.id) || conAct.has(f.id);
    if (razon) conRazon++; else sinRazon++;
  }
  for (const f of burst) {
    const razon = !!f.manualClientId || !!f.transcript || !!f.summary || conLink.has(f.id) || conMin.has(f.id) || conAct.has(f.id);
    if (!razon) burstSinRazon++;
  }
  console.log(`\nB. de 442 futuras: ${conRazon} tienen razón de preservación, ${sinRazon} NO la tienen`);
  console.log(`   de la ráfaga 2026-07-07T15 (${burst.length}): ${burstSinRazon} SIN razón de preservación`);
  console.log("   => si la purga hubiera corrido DESPUÉS de la ráfaga, esas", burstSinRazon, "estarían borradas");

  // C. Futuras por cliente (impacto en getClientSessions take:200)
  const porCliente = new Map<string,number>();
  for (const f of fut) if (f.resolvedClientId) porCliente.set(f.resolvedClientId,(porCliente.get(f.resolvedClientId)??0)+1);
  const top = [...porCliente.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
  const names = await prisma.client.findMany({where:{id:{in:top.map(t=>t[0])}},select:{id:true,name:true}});
  const nm = new Map(names.map(c=>[c.id,c.name]));
  console.log("\nC. futuras por cliente (top 8) + total de sesiones del cliente:");
  for (const [cid,n] of top) {
    const total = await prisma.firefliesSession.count({where:{OR:[{resolvedClientId:cid},{manualClientId:cid}]}});
    console.log(`   ${nm.get(cid)}: ${n} futuras / ${total} totales -> ${total>200?"la ventana take:200 se llena":"cabe entera"}; futuras ocupan ${(n/Math.min(total,200)*100).toFixed(0)}% del contexto`);
  }

  // D. ¿Qué tocó las 151 futuras post-fix? distribución de updatedAt
  const tocadas = await prisma.firefliesSession.findMany({where:{date:{gt:manana},updatedAt:{gt:FIX}},
    select:{id:true,date:true,syncedAt:true,updatedAt:true,enrichedAt:true,enrichAttempts:true,resolvedClientId:true}, orderBy:{updatedAt:"desc"}, take:8});
  const cnt = new Map<string,number>();
  const all = await prisma.firefliesSession.findMany({where:{date:{gt:manana},updatedAt:{gt:FIX}},select:{updatedAt:true}});
  for (const t of all) { const k=t.updatedAt.toISOString().slice(0,10); cnt.set(k,(cnt.get(k)??0)+1); }
  console.log("\nD. 151 futuras tocadas post-fix — updatedAt por día:", [...cnt.entries()].sort());
  console.log("   muestras (más recientes):");
  for (const t of tocadas) console.log(`   date=${t.date.toISOString().slice(0,10)} sync=${t.syncedAt.toISOString().slice(0,16)} upd=${t.updatedAt.toISOString().slice(0,16)} enrichedAt=${t.enrichedAt?"SI":"no"} attempts=${t.enrichAttempts}`);
}
main().finally(()=>prisma.$disconnect());
