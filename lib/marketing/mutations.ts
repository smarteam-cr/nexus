/**
 * lib/marketing/mutations.ts
 *
 * Escrituras Prisma del módulo Marketing + Contenido (server-only). Los
 * endpoints validan el input con Zod (lib/marketing/schema.ts) ANTES de llamar
 * acá. Single-tenant: nada cuelga de Client.
 */
import { prisma } from "@/lib/db/prisma";
import type { IcpSection, Prisma } from "@prisma/client";

// ── ICP ────────────────────────────────────────────────────────────────────────

export async function createIcpItem(section: IcpSection, label: string) {
  // order = al final de su sección
  const max = await prisma.icpItem.aggregate({ where: { section }, _max: { order: true } });
  return prisma.icpItem.create({
    data: { section, label, order: (max._max.order ?? -1) + 1 },
  });
}

export async function updateIcpItem(id: string, data: { label?: string; order?: number }) {
  return prisma.icpItem.update({ where: { id }, data });
}

export async function deleteIcpItem(id: string) {
  return prisma.icpItem.delete({ where: { id } });
}

// ── Buyer personas ─────────────────────────────────────────────────────────────

export async function createPersona(data: Prisma.BuyerPersonaCreateInput) {
  return prisma.buyerPersona.create({ data });
}
export async function updatePersona(id: string, data: Prisma.BuyerPersonaUpdateInput) {
  return prisma.buyerPersona.update({ where: { id }, data });
}
export async function deletePersona(id: string) {
  return prisma.buyerPersona.delete({ where: { id } });
}

// ── Pilares ────────────────────────────────────────────────────────────────────

export async function createPillar(data: { name: string; description?: string | null }) {
  return prisma.contentPillar.create({ data });
}
export async function updatePillar(id: string, data: Prisma.ContentPillarUpdateInput) {
  return prisma.contentPillar.update({ where: { id }, data });
}

/** Borrar pilar: las ideas quedan con pillarId=null (SetNull), no se pierden. */
export async function deletePillar(id: string) {
  return prisma.contentPillar.delete({ where: { id } });
}

// ── Fuentes ────────────────────────────────────────────────────────────────────

export async function createSource(data: { profileUrl: string; label?: string | null }) {
  return prisma.inspirationSource.create({ data });
}
export async function updateSource(id: string, data: Prisma.InspirationSourceUpdateInput) {
  return prisma.inspirationSource.update({ where: { id }, data });
}

/** Borrar fuente: CASCADE borra sus posts (y los pivotes de ideas que los citaban). */
export async function deleteSource(id: string) {
  return prisma.inspirationSource.delete({ where: { id } });
}

// ── Voz de marca ───────────────────────────────────────────────────────────────

export async function updateBrandVoice(brandVoice: string) {
  return prisma.marketingSettings.upsert({
    where: { id: "marketing" },
    update: { brandVoice },
    create: { id: "marketing", brandVoice },
  });
}

// ── Salidas del agente (podar / aprobar) ───────────────────────────────────────

export async function deleteIdea(id: string) {
  return prisma.contentIdea.delete({ where: { id } });
}

/**
 * Patch de una idea en UN solo update (atómico): transiciones de estado
 * (selected/used → sus timestamps) y/o edición de campos (title/copy/imageConcept).
 * Un solo write evita estados parciales (p.ej. "reabrir" = selected+used juntos).
 * Los campos ausentes NO se tocan; `updatedAt` se maneja solo.
 */
export async function patchIdea(
  id: string,
  fields: {
    selected?: boolean;
    used?: boolean;
    discarded?: boolean;
    title?: string;
    copy?: string;
    imageConcept?: string;
  },
) {
  const data: Prisma.ContentIdeaUpdateInput = {};
  if (fields.selected !== undefined) data.selectedAt = fields.selected ? new Date() : null;
  if (fields.used !== undefined) data.usedAt = fields.used ? new Date() : null;
  if (fields.discarded !== undefined) data.discardedAt = fields.discarded ? new Date() : null;
  if (fields.title !== undefined) data.title = fields.title;
  if (fields.copy !== undefined) data.copy = fields.copy;
  if (fields.imageConcept !== undefined) data.imageConcept = fields.imageConcept;
  return prisma.contentIdea.update({ where: { id }, data });
}

/**
 * Marca una idea como enviada a HubSpot (borrador social) y acumula los guids.
 * Enviar a HubSpot TAMBIÉN aprueba (usedAt): la publicación pasa a "Aprobadas".
 */
export async function markIdeaHubspotDraft(id: string, newGuids: string[]) {
  const now = new Date();
  return prisma.contentIdea.update({
    where: { id },
    data: {
      hubspotDraftAt: now,
      hubspotDraftGuids: { push: newGuids },
      usedAt: now, // aprobar al enviar; si ya estaba aprobada, solo re-sella (sigue aprobada)
    },
  });
}

export async function reviewCampaign(id: string, action: "approve" | "discard") {
  return prisma.campaignIdea.update({
    where: { id },
    data: {
      status: action === "approve" ? "APPROVED" : "DISCARDED",
      reviewedAt: new Date(),
    },
  });
}

export async function deleteCampaign(id: string) {
  return prisma.campaignIdea.delete({ where: { id } });
}

/**
 * Aprobar una sugerencia de pilar (transacción): crea el ContentPillar
 * (origin=AGENT), marca la sugerencia APPROVED y RE-LINKEA las ideas huérfanas
 * que referían ese nombre (suggestedPillarName, case-insensitive) al pilar nuevo.
 */
export async function approvePillarSuggestion(id: string) {
  return prisma.$transaction(async (tx) => {
    const suggestion = await tx.pillarSuggestion.findUnique({ where: { id } });
    if (!suggestion) throw new Error("La sugerencia no existe.");
    if (suggestion.status !== "PENDING") throw new Error("La sugerencia ya fue revisada.");

    // Si ya existe un pilar con ese nombre (creado a mano entre medio), reusarlo.
    const existing = await tx.contentPillar.findFirst({
      where: { name: { equals: suggestion.name, mode: "insensitive" } },
    });
    const pillar =
      existing ??
      (await tx.contentPillar.create({
        data: {
          name: suggestion.name,
          description: suggestion.description,
          origin: "AGENT",
        },
      }));

    await tx.pillarSuggestion.update({
      where: { id },
      data: { status: "APPROVED", approvedPillarId: pillar.id, reviewedAt: new Date() },
    });

    const relinked = await tx.contentIdea.updateMany({
      where: {
        pillarId: null,
        suggestedPillarName: { equals: suggestion.name, mode: "insensitive" },
      },
      data: { pillarId: pillar.id, suggestedPillarName: null },
    });

    return { pillar, relinkedIdeas: relinked.count };
  });
}

export async function discardPillarSuggestion(id: string) {
  return prisma.pillarSuggestion.update({
    where: { id },
    data: { status: "DISCARDED", reviewedAt: new Date() },
  });
}
