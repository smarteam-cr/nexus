/**
 * lib/business-cases/mutations.ts — escrituras del módulo de Ventas.
 *
 * Invariantes: el agente propone (bloques DRAFT/AGENT), el vendedor confirma
 * (status CONFIRMED + confirmedAt/By). Regenerar NUNCA pisa bloques CONFIRMED ni
 * editados por humano. Publicar congela un snapshot client-safe.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { Prisma, type BusinessCaseBlockType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { BLOCK_ORDER, type GeneratedBlock } from "./schema";

const BCRYPT_ROUNDS = 12;
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "business-case";
}

function generatePassword(len = 12): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  return out;
}

const idx = (bt: BusinessCaseBlockType): number => {
  const i = BLOCK_ORDER.indexOf(bt);
  return i === -1 ? 999 : i;
};

// ── Business case ────────────────────────────────────────────────────────────

export async function createBusinessCase(input: {
  clientId: string;
  name: string;
  hubspotCompanyId?: string | null;
  hubspotDealId?: string | null;
  createdByEmail?: string | null;
}) {
  const slug = `${slugify(input.name)}-${randomBytes(3).toString("hex")}`;
  return prisma.businessCase.create({
    data: {
      clientId: input.clientId,
      name: input.name,
      slug,
      hubspotCompanyId: input.hubspotCompanyId ?? null,
      hubspotDealId: input.hubspotDealId ?? null,
      createdByEmail: input.createdByEmail ?? null,
    },
  });
}

export async function updateBusinessCase(
  id: string,
  data: {
    name?: string;
    status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    hubspotCompanyId?: string | null;
  },
) {
  return prisma.businessCase.update({ where: { id }, data });
}

/**
 * Borra un business case. Por cascade (FKs ON DELETE CASCADE) se llevan también sus
 * canvases versionados → secciones → bloques, las sesiones de contexto, los transcripts,
 * el acceso externo y los agent runs. NO toca el cliente/prospecto ni las FirefliesSessions
 * (BusinessCaseSession no tiene FK dura a la sesión: solo se borra el vínculo).
 */
export async function deleteBusinessCase(id: string) {
  return prisma.businessCase.delete({ where: { id } });
}

// ── Transcripts ──────────────────────────────────────────────────────────────

export async function addPastedTranscript(
  businessCaseId: string,
  rawText: string,
  fileName?: string | null,
) {
  return prisma.businessCaseTranscript.create({
    data: {
      businessCaseId,
      source: "PASTED",
      rawText,
      fileName: fileName ?? null,
      processedAt: new Date(),
    },
  });
}

export async function addUploadedTranscript(input: {
  businessCaseId: string;
  rawText: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}) {
  return prisma.businessCaseTranscript.create({
    data: { ...input, source: "UPLOADED", processedAt: new Date() },
  });
}

// ── Bloques ──────────────────────────────────────────────────────────────────

/**
 * Aplica los bloques generados por el agente. Borra los DRAFT/AGENT previos
 * (regeneración limpia), CONSERVA los CONFIRMED y los editados por humano, y crea
 * solo los tipos que no existan ya. Reordena por BLOCK_ORDER.
 */
export async function applyGeneratedBlocks(
  businessCaseId: string,
  generated: GeneratedBlock[],
  agentRunId: string | null,
) {
  await prisma.businessCaseBlock.deleteMany({
    where: { businessCaseId, status: "DRAFT", source: "AGENT" },
  });
  const existing = await prisma.businessCaseBlock.findMany({
    where: { businessCaseId },
    select: { blockType: true },
  });
  const kept = new Set(existing.map((b) => b.blockType));
  const toCreate = generated
    .filter((g) => !kept.has(g.blockType))
    .sort((a, b) => idx(a.blockType) - idx(b.blockType));

  for (const g of toCreate) {
    await prisma.businessCaseBlock.create({
      data: {
        businessCaseId,
        blockType: g.blockType,
        content: g.content as Prisma.InputJsonValue,
        needsValidation: g.needsValidation,
        status: "DRAFT",
        source: "AGENT",
        agentRunId,
        order: idx(g.blockType),
      },
    });
  }
  await reorderBlocks(businessCaseId);
}

async function reorderBlocks(businessCaseId: string) {
  const blocks = await prisma.businessCaseBlock.findMany({
    where: { businessCaseId },
    select: { id: true, blockType: true },
  });
  const sorted = [...blocks].sort((a, b) => idx(a.blockType) - idx(b.blockType));
  await Promise.all(
    sorted.map((b, i) =>
      prisma.businessCaseBlock.update({ where: { id: b.id }, data: { order: i } }),
    ),
  );
}

/**
 * Edición granular de un bloque (mismo patrón que CanvasBlock): undo de 1 nivel,
 * marca MODIFIED si un humano edita un bloque AGENT, sella confirmedAt/By al
 * confirmar.
 */
export async function editBlock(
  blockId: string,
  edit: {
    content?: Record<string, unknown>;
    isVisible?: boolean;
    status?: "DRAFT" | "CONFIRMED";
    undo?: boolean;
  },
  editorEmail?: string | null,
) {
  const block = await prisma.businessCaseBlock.findUnique({ where: { id: blockId } });
  if (!block) return null;

  const data: Prisma.BusinessCaseBlockUpdateInput = {};

  if (edit.undo) {
    if (block.previousContent != null) {
      data.content = block.previousContent as Prisma.InputJsonValue;
      data.previousContent = block.content as Prisma.InputJsonValue;
    }
  } else if (edit.content !== undefined) {
    data.previousContent = block.content as Prisma.InputJsonValue;
    data.content = edit.content as Prisma.InputJsonValue;
    if (block.source === "AGENT") data.source = "MODIFIED";
  }

  if (edit.isVisible !== undefined) data.isVisible = edit.isVisible;

  if (edit.status !== undefined) {
    data.status = edit.status;
    if (edit.status === "CONFIRMED") {
      data.confirmedAt = new Date();
      data.confirmedByEmail = editorEmail ?? null;
    } else {
      data.confirmedAt = null;
      data.confirmedByEmail = null;
    }
  }

  return prisma.businessCaseBlock.update({ where: { id: blockId }, data });
}

/** Sobrescribe el content de un bloque (usado por la edición por IA). */
export async function setBlockContent(
  blockId: string,
  content: Record<string, unknown>,
  markModified = true,
) {
  const block = await prisma.businessCaseBlock.findUnique({ where: { id: blockId } });
  if (!block) return null;
  return prisma.businessCaseBlock.update({
    where: { id: blockId },
    data: {
      previousContent: block.content as Prisma.InputJsonValue,
      content: content as Prisma.InputJsonValue,
      status: "DRAFT",
      source: markModified && block.source === "AGENT" ? "MODIFIED" : block.source,
    },
  });
}

export async function deleteBlock(blockId: string) {
  return prisma.businessCaseBlock.delete({ where: { id: blockId } });
}

// ── Acceso externo + publicación ─────────────────────────────────────────────

/** Crea (o reactiva) el acceso token+password del business case. */
export async function ensureAccess(businessCaseId: string, createdByEmail?: string | null) {
  const existing = await prisma.businessCaseExternalAccess.findUnique({
    where: { businessCaseId },
    select: { id: true, accessToken: true, accessPassword: true },
  });
  if (existing && existing.accessPassword) {
    await prisma.businessCaseExternalAccess.update({
      where: { businessCaseId },
      data: { revokedAt: null },
    });
    return existing;
  }
  const accessToken = randomBytes(32).toString("hex");
  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return prisma.businessCaseExternalAccess.upsert({
    where: { businessCaseId },
    create: {
      businessCaseId,
      accessToken,
      passwordHash,
      accessPassword: password,
      createdByEmail: createdByEmail ?? null,
    },
    update: {
      accessToken,
      passwordHash,
      accessPassword: password,
      revokedAt: null,
      lastUsedAt: null,
      enabledAt: new Date(),
      createdByEmail: createdByEmail ?? null,
    },
    select: { id: true, accessToken: true, accessPassword: true },
  });
}

/**
 * Publica: congela el snapshot client-safe (bloques CONFIRMED + visibles, en
 * orden), setea publishedAt, asegura el acceso. Devuelve el acceso (token+pass).
 */
export async function publishBusinessCase(businessCaseId: string, createdByEmail?: string | null) {
  const blocks = await prisma.businessCaseBlock.findMany({
    where: { businessCaseId, status: "CONFIRMED", isVisible: true },
    orderBy: { order: "asc" },
    select: { id: true, blockType: true, content: true, needsValidation: true },
  });
  const bc = await prisma.businessCase.findUnique({
    where: { id: businessCaseId },
    select: { name: true, client: { select: { name: true, logoUrl: true } } },
  });
  const snapshot = {
    name: bc?.name ?? "",
    clientName: bc?.client.name ?? "",
    clientLogoUrl: bc?.client.logoUrl ?? null,
    blocks: blocks.map((b) => ({
      id: b.id,
      blockType: b.blockType,
      content: b.content,
      needsValidation: b.needsValidation,
    })),
  };
  await prisma.businessCase.update({
    where: { id: businessCaseId },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });
  return ensureAccess(businessCaseId, createdByEmail);
}

/** Revoca el acceso público (sin borrar el row) y despublica. */
export async function revokeBusinessCase(businessCaseId: string) {
  await prisma.businessCaseExternalAccess.updateMany({
    where: { businessCaseId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.businessCase.update({
    where: { id: businessCaseId },
    data: { publishedAt: null },
  });
}
