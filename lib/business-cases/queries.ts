/**
 * lib/business-cases/queries.ts — lecturas del módulo de Ventas.
 */
import { prisma } from "@/lib/db/prisma";

export async function listBusinessCases(clientId: string) {
  return prisma.businessCase.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      hubspotCompanyId: true,
      publishedAt: true,
      createdByEmail: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { blocks: true, transcripts: true } },
    },
  });
}

export async function getBusinessCase(id: string) {
  return prisma.businessCase.findUnique({
    where: { id },
    include: {
      blocks: { orderBy: { order: "asc" } },
      transcripts: { orderBy: { createdAt: "asc" } },
      access: {
        select: {
          accessToken: true,
          accessPassword: true,
          enabledAt: true,
          revokedAt: true,
          lastUsedAt: true,
        },
      },
      client: { select: { id: true, name: true, logoUrl: true, hubspotCompanyId: true } },
    },
  });
}

export async function getBlocks(businessCaseId: string) {
  return prisma.businessCaseBlock.findMany({
    where: { businessCaseId },
    orderBy: { order: "asc" },
  });
}

/** clientId dueño de un business case (para guards de acceso). */
export async function getOwnerClientId(businessCaseId: string): Promise<string | null> {
  const bc = await prisma.businessCase.findUnique({
    where: { id: businessCaseId },
    select: { clientId: true },
  });
  return bc?.clientId ?? null;
}

export async function getBlockOwner(blockId: string): Promise<{ businessCaseId: string; clientId: string } | null> {
  const block = await prisma.businessCaseBlock.findUnique({
    where: { id: blockId },
    select: { businessCaseId: true, businessCase: { select: { clientId: true } } },
  });
  if (!block) return null;
  return { businessCaseId: block.businessCaseId, clientId: block.businessCase.clientId };
}
