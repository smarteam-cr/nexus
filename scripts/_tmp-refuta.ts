import { prisma } from "@/lib/db/prisma";
import { buildCategorizeCtx } from "@/lib/sessions/resolve-client";
import { categorizeSession, buildInternalDomainsSet, normalize } from "@/lib/sessions/categorize";
import { esReunionDePuertasAdentro, PISO_REUNIONES_INTERNAS } from "@/lib/sessions/candidatas-internas";

const SID = "gmeet_3qh2querqilsuod6rpdi7pnrlr_20260818T160000Z";
const CLIENT = "cmsqdfqie001807pgl27goq22";

async function main() {
  const cats = await prisma.sessionCategory.findMany({ select: { id:true,name:true,kind:true,domains:true }});
  console.log("CATEGORIAS internal:", JSON.stringify(cats.filter(c=>c.kind==="internal")));
  const dom = buildInternalDomainsSet(cats);
  console.log("internalDomains:", [...dom]);

  const s = await prisma.firefliesSession.findUnique({ where: { id: SID },
    select: { id:true,title:true,date:true,participants:true,organizerEmail:true,resolvedClientId:true,manualClientId:true }});
  console.log("SESION:", JSON.stringify(s));

  const ctx = await buildCategorizeCtx();
  console.log("ctx clients:", ctx.clients.length, "ambiguous:", ctx.ambiguousNameTokens?.size);
  if (s) {
    const g = categorizeSession({ title: s.title, participants: s.participants, manualClientId: s.manualClientId }, ctx);
    console.log("CASCADA REAL =>", JSON.stringify(g));
    console.log("puertas adentro =>", esReunionDePuertasAdentro(s, dom));
  }

  const toks = ["sales","service","o4bi","handoff"];
  const hits = ctx.clients.filter(c => {
    const parts = [...normalize(c.name).split(/[\s.\-_]+/), ...(c.company?normalize(c.company).split(/[\s.\-_]+/):[])];
    return parts.some(p => toks.includes(p));
  });
  console.log("clientes con token sales/service/o4bi/handoff:", JSON.stringify(hits.map(c=>c.name)));
  console.log("ambiguous?", JSON.stringify(toks.map(t=>[t, ctx.ambiguousNameTokens?.has(t)])));

  const own = await prisma.firefliesSession.findMany({
    where: { OR: [{resolvedClientId: CLIENT},{manualClientId: CLIENT}] },
    select: { id:true,title:true,date:true,resolvedClientId:true,manualClientId:true, projects:{select:{projectId:true}} },
    orderBy: { date: "desc" }, take: 20,
  });
  console.log("SESIONES DE REMPRO:", own.length);
  for (const o of own) console.log("  ", o.date.toISOString().slice(0,16), "|", o.title, "| proy:", o.projects.map(p=>p.projectId).join(","));

  const huerf = await prisma.firefliesSession.count({ where: { resolvedClientId:null, manualClientId:null }});
  const huerfVent = await prisma.firefliesSession.count({ where: { resolvedClientId:null, manualClientId:null, date:{gte:PISO_REUNIONES_INTERNAS, lte:new Date()} }});
  console.log("huerfanas total:", huerf, "en ventana modal:", huerfVent);
  await prisma.$disconnect();
}
main().catch(async (e)=>{ console.error(e); await prisma.$disconnect(); process.exit(1); });
