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
import { sanitizeTags } from "@/lib/tags/catalog";

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
  /** Tipo de caso (slug de BC_TYPE_CATALOG) + sub-tipo. null = impl. HubSpot (legacy). */
  caseType?: string | null;
  caseSubtype?: string | null;
  /** Tags seed del tipo (slugs del catálogo; se sanitizan). El CSE los edita después. */
  tags?: string[];
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
      caseType: input.caseType ?? null,
      caseSubtype: input.caseSubtype ?? null,
      ...(input.tags?.length ? { tags: sanitizeTags(input.tags) } : {}),
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

/** Días de vida del link del prospecto cuando se publica. Editable por propuesta desde
 *  el panel "Acceso del cliente" (PATCH .../external-access) — esto es solo el arranque. */
export const DIAS_DE_CADUCIDAD_POR_DEFECTO = 30;

/** Forma del acceso que devuelven ensureAccess / setAccessMode / setAccessExpiry. */
export interface BcAccessRow {
  id: string;
  accessToken: string;
  accessPassword: string | null;
  requiresPassword: boolean;
  expiresAt: Date | null;
}

const ACCESS_SELECT = {
  id: true,
  accessToken: true,
  accessPassword: true,
  requiresPassword: true,
  expiresAt: true,
} as const;

function vencimientoPorDefecto(): Date {
  return new Date(Date.now() + DIAS_DE_CADUCIDAD_POR_DEFECTO * 24 * 60 * 60 * 1000);
}

/**
 * Crea o REUSA el acceso del business case. Es idempotente a propósito.
 *
 * ⚠ Ya NO rota el token de un acceso vivo, y NO decide el modo: el modo lo cambia solo
 * `setAccessMode`. Publicar de nuevo tiene que dejar el link EXACTAMENTE como estaba —
 * antes rotaba cuando faltaba `accessPassword`, y con eso una republicación podía
 * invalidar en silencio el link que el vendedor ya había mandado por correo.
 *
 * La única rotación que queda es la de un acceso REVOCADO que vuelve a publicarse: ahí
 * rotar es el punto (el CSE revocó justamente para matar un link filtrado).
 */
export async function ensureAccess(
  businessCaseId: string,
  createdByEmail?: string | null,
): Promise<BcAccessRow> {
  const existing = await prisma.businessCaseExternalAccess.findUnique({
    where: { businessCaseId },
    select: { ...ACCESS_SELECT, revokedAt: true },
  });

  if (existing && !existing.revokedAt) {
    // Vivo: se respeta token, contraseña y modo. Solo se (re)arma la ventana de
    // caducidad si nunca se fijó o si ya venció — republicar revive una propuesta
    // caducada, que es lo que el CSE espera al volver a tocar "Subir al cliente".
    const venceYa = !existing.expiresAt || existing.expiresAt.getTime() <= Date.now();
    if (!venceYa) {
      const { revokedAt: _revokedAt, ...row } = existing;
      return row;
    }
    return prisma.businessCaseExternalAccess.update({
      where: { businessCaseId },
      data: { expiresAt: vencimientoPorDefecto() },
      select: ACCESS_SELECT,
    });
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
      expiresAt: vencimientoPorDefecto(),
      createdByEmail: createdByEmail ?? null,
    },
    update: {
      accessToken,
      passwordHash,
      accessPassword: password,
      // Un acceso revocado que revive vuelve al modo por defecto (abierto): la decisión
      // de pedir contraseña se toma sobre el link NUEVO, no se hereda del que se mató.
      requiresPassword: false,
      expiresAt: vencimientoPorDefecto(),
      revokedAt: null,
      lastUsedAt: null,
      enabledAt: new Date(),
      createdByEmail: createdByEmail ?? null,
    },
    select: ACCESS_SELECT,
  });
}

/**
 * Acceso VIVO sobre el que ajustar modo/caducidad; lo crea si no existe.
 *
 * Devuelve `null` cuando la fila existe pero está REVOCADA. Es el punto entero de que
 * esta función exista: `ensureAccess` resucita un acceso revocado (para eso está, la
 * republicación lo necesita), así que enchufarle el toggle del panel haría que marcar un
 * check reviviera en silencio un link que alguien mató a propósito porque se había
 * filtrado. Revivir un acceso es una sola cosa y tiene un solo botón: "Subir al cliente".
 */
async function accesoVivoOCreado(
  businessCaseId: string,
  createdByEmail?: string | null,
): Promise<BcAccessRow | null> {
  const existing = await prisma.businessCaseExternalAccess.findUnique({
    where: { businessCaseId },
    select: { ...ACCESS_SELECT, revokedAt: true },
  });
  if (existing?.revokedAt) return null;
  return ensureAccess(businessCaseId, createdByEmail);
}

/**
 * Cambia el MODO de acceso (con / sin contraseña). No rota el token: la puerta que deja
 * de servir redirige a la que sirve (ver lib/business-cases/access-url.ts), así ningún
 * link ya enviado queda muerto.
 *
 * Al ENCENDER la contraseña se regenera: la anterior pudo haber circulado en claro por el
 * panel mientras la propuesta estaba abierta, y una contraseña "nueva" que en realidad es
 * la vieja es peor que no tenerla, porque el vendedor cree que rotó.
 *
 * `null` = el acceso está revocado y no se toca (ver accesoVivoOCreado).
 */
export async function setAccessMode(
  businessCaseId: string,
  requiresPassword: boolean,
  createdByEmail?: string | null,
): Promise<BcAccessRow | null> {
  const access = await accesoVivoOCreado(businessCaseId, createdByEmail);
  if (!access) return null;
  if (access.requiresPassword === requiresPassword) return access;

  if (!requiresPassword) {
    return prisma.businessCaseExternalAccess.update({
      where: { businessCaseId },
      data: { requiresPassword: false },
      select: ACCESS_SELECT,
    });
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return prisma.businessCaseExternalAccess.update({
    where: { businessCaseId },
    data: { requiresPassword: true, passwordHash, accessPassword: password },
    select: ACCESS_SELECT,
  });
}

/** Fija (o quita, con null) la caducidad del link. `null` = acceso revocado, no se toca. */
export async function setAccessExpiry(
  businessCaseId: string,
  expiresAt: Date | null,
  createdByEmail?: string | null,
): Promise<BcAccessRow | null> {
  const access = await accesoVivoOCreado(businessCaseId, createdByEmail);
  if (!access) return null;
  return prisma.businessCaseExternalAccess.update({
    where: { businessCaseId },
    data: { expiresAt },
    select: ACCESS_SELECT,
  });
}

// ── Aprobación del cliente ───────────────────────────────────────────────────

export interface BcApproval {
  approvedAt: Date;
  approvedByEmail: string | null;
  approvedByName: string | null;
  approvedSnapshotAt: Date | null;
}

/**
 * El prospecto aprueba la propuesta desde la propia landing (sin login, solo su correo).
 *
 * IDEMPOTENTE por diseño: si ya estaba aprobada devuelve la aprobación EXISTENTE sin
 * pisarla. Quién aprobó primero es el dato que le importa a Ventas; permitir que un
 * segundo click lo reescriba convertiría el registro en "el último que pasó por acá".
 *
 * `approvedSnapshotAt` congela el `publishedAt` del momento → si el CSE republica
 * después, la UI puede avisar que se aprobó otra versión.
 */
export async function approveBusinessCase(
  businessCaseId: string,
  input: { email: string; name?: string | null },
): Promise<{ approval: BcApproval; yaEstaba: boolean }> {
  const bc = await prisma.businessCase.findUnique({
    where: { id: businessCaseId },
    select: { publishedAt: true, approvedAt: true, approvedByEmail: true, approvedByName: true, approvedSnapshotAt: true },
  });
  if (!bc) throw new Error("business case inexistente");

  if (bc.approvedAt) {
    return {
      yaEstaba: true,
      approval: {
        approvedAt: bc.approvedAt,
        approvedByEmail: bc.approvedByEmail,
        approvedByName: bc.approvedByName,
        approvedSnapshotAt: bc.approvedSnapshotAt,
      },
    };
  }

  const updated = await prisma.businessCase.update({
    where: { id: businessCaseId },
    data: {
      approvedAt: new Date(),
      approvedByEmail: input.email,
      approvedByName: input.name?.trim() || null,
      approvedSnapshotAt: bc.publishedAt,
    },
    select: { approvedAt: true, approvedByEmail: true, approvedByName: true, approvedSnapshotAt: true },
  });
  return { yaEstaba: false, approval: updated as BcApproval };
}

/** Borra la aprobación (aprobaciones de prueba, correo equivocado). Solo interno. */
export async function clearApproval(businessCaseId: string) {
  return prisma.businessCase.update({
    where: { id: businessCaseId },
    data: { approvedAt: null, approvedByEmail: null, approvedByName: null, approvedSnapshotAt: null },
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
