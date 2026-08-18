import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) });
async function main() {
  const ps = await prisma.project.findMany({
    where: { clientId: "cmsqdfqie001807pgl27goq22" },
    select: { id: true, name: true, status: true, createdAt: true, updatedAt: true,
      hubspotServiceId: true, hubspotDealId: true, hubspotPipelineId: true, hubspotPipelineStageLabel: true,
      altaEstado: true, altaIntentos: true, altaIniciadaAt: true, altaUltimoIntentoAt: true,
      altaReclasificadoAt: true, altaPipelineElegido: true, altaActorEmail: true, altaError: true,
      altaInternoDeclarado: true, altaHermanoHsId: true, altaSinTratoMotivo: true,
      proyectoInterno: true, hermanoCsProjectId: true, serviceType: true, projectType: true,
      handoff: { select: { id: true, hubspotDealId: true, createdAt: true, hubspotSyncStatus: true, hubspotProjectId: true } },
      canvases: { select: { id: true, slug: true, name: true, createdAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  for (const p of ps) {
    console.log("=====", p.name, p.id);
    const { canvases, ...rest } = p;
    console.log(JSON.stringify(rest, null, 1));
    console.log("canvases:", canvases.map(c => `${c.slug}@${c.createdAt.toISOString()}`).join(" | "));
  }
  const cl = await prisma.client.findUnique({ where: { id: "cmsqdfqie001807pgl27goq22" },
    select: { id: true, name: true, kind: true, hubspotCompanyId: true, createdAt: true, ignoredHubspotServiceIds: true } });
  console.log("CLIENT", JSON.stringify(cl, null, 1));
}
main().finally(() => prisma.$disconnect());
