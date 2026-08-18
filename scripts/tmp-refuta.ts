import { createScriptDb } from "./lib/db";
import { esProyectoNavegable, proyectoNavegableWhere } from "@/lib/projects/scope";

async function main() {
const { prisma, close } = createScriptDb();
try {
  const dup = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "clientId", "hubspotDealId", count(*)::int n, array_agg("name") nombres
    FROM "Project" WHERE "status"='active' AND "hubspotDealId" IS NOT NULL
    GROUP BY 1,2 HAVING count(*) > 1 ORDER BY n DESC`);
  console.log("A) grupos ACTIVOS con mismo (clientId,dealId):", dup.length);
  for (const d of dup.slice(0, 25)) console.log("   ", d.clientId, d.hubspotDealId, d.n, JSON.stringify(d.nombres));

  const dup2 = await prisma.$queryRawUnsafe<any[]>(`
    SELECT count(*)::int n FROM (SELECT "clientId","hubspotDealId" FROM "Project"
      WHERE "hubspotDealId" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) t`);
  console.log("A2) grupos (cualquier status):", dup2[0].n);

  const porKind = await prisma.$queryRawUnsafe<any[]>(`
    SELECT c."kind", count(DISTINCT c."id")::int empresas, count(p."id")::int proys
    FROM "Client" c JOIN "Project" p ON p."clientId"=c."id"
    WHERE p."status"='active' AND (p."serviceType" IS NULL OR p."serviceType" <> '__strategy__')
    GROUP BY 1 ORDER BY 2 DESC`);
  console.log("B) empresas con proyecto activo por kind:", porKind);

  const cid = "cmsqdfqie001807pgl27goq22";
  const c = await prisma.client.findUnique({ where: { id: cid }, select: { kind: true, hubspotCompanyId: true, company: true, emailDomains: true } });
  const acct = await prisma.hubspotAccount.findFirst({ where: { clientId: cid }, select: { id: true } });
  const projs = await prisma.project.findMany({ where: { clientId: cid }, select: { id: true, name: true, status: true, serviceType: true, hubspotServiceId: true, hubspotPipelineId: true, proyectoInterno: true, hermanoCsProjectId: true, altaEstado: true } });
  const pf = { hubspotCompanyId: c?.hubspotCompanyId ?? null, tieneHubspotAccount: !!acct };
  console.log("C) client:", c, "acct:", acct);
  for (const p of projs) console.log("   proj", p.id, JSON.stringify(p.name), "st=", p.status, "sType=", p.serviceType, "alta=", p.altaEstado, "navJS=", esProyectoNavegable(p as any, pf as any));
  const sql = await prisma.project.findMany({ where: proyectoNavegableWhere({ clientId: cid }), select: { id: true } });
  console.log("   navSQL:", sql.map(x => x.id));

  const s = await prisma.firefliesSession.findUnique({ where: { id: "gmeet_3qh2querqilsuod6rpdi7pnrlr_20260818T160000Z" }, select: { id: true, title: true, date: true, resolvedClientId: true, manualClientId: true, participants: true, organizerEmail: true } });
  console.log("D) sesión:", s);
  if (s) console.log("   links:", await prisma.sessionProject.count({ where: { sessionId: s.id } }));
} finally { await close(); }
}
main();
