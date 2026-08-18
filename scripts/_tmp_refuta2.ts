import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) });
const DEAL = "63739981726";
async function main() {
  console.log("--- Handoffs con ese deal ---");
  console.log(JSON.stringify(await prisma.handoff.findMany({ where: { hubspotDealId: DEAL },
    select: { id: true, clientId: true, projectId: true, createdAt: true, updatedAt: true, client: { select: { name: true } }, project: { select: { name: true } } } }), null, 1));

  console.log("--- Projects con ese deal (todos los clientes) ---");
  console.log(JSON.stringify(await prisma.project.findMany({ where: { hubspotDealId: DEAL },
    select: { id: true, name: true, clientId: true, createdAt: true, client: { select: { name: true, kind: true } } } }), null, 1));

  console.log("--- Handoffs creados 2026-08-18 ---");
  console.log(JSON.stringify(await prisma.handoff.findMany({ where: { createdAt: { gte: new Date("2026-08-18T00:00:00Z") } },
    select: { id: true, hubspotDealId: true, createdAt: true, updatedAt: true, client: { select: { name: true } }, project: { select: { name: true } } }, orderBy: { createdAt: "asc" } }), null, 1));

  console.log("--- Clientes cuyo nombre contiene O4BI ---");
  console.log(JSON.stringify(await prisma.client.findMany({ where: { OR: [{ name: { contains: "O4BI", mode: "insensitive" } }, { company: { contains: "O4BI", mode: "insensitive" } }] },
    select: { id: true, name: true, kind: true, hubspotCompanyId: true, ignoredHubspotServiceIds: true } }), null, 1));

  console.log("--- Projects nombre contiene O4BI ---");
  console.log(JSON.stringify(await prisma.project.findMany({ where: { name: { contains: "O4BI", mode: "insensitive" } },
    select: { id: true, name: true, clientId: true, hubspotDealId: true, hubspotServiceId: true, createdAt: true, status: true, client: { select: { name: true } } } }), null, 1));

  console.log("--- BusinessCases con ese deal ---");
  console.log(JSON.stringify(await prisma.businessCase.findMany({ where: { hubspotDealId: DEAL },
    select: { id: true, clientId: true, title: true, createdAt: true, client: { select: { name: true } } } }), null, 1));

  console.log("--- Total handoffs / con deal ---");
  console.log(await prisma.handoff.count(), await prisma.handoff.count({ where: { hubspotDealId: { not: null } } }));
}
main().finally(() => prisma.$disconnect());
