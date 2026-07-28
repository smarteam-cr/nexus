/**
 * lib/print/job-token.ts — el pase de un solo uso con el que Puppeteer entra a la página
 * de impresión, para CUALQUIER tipo de documento.
 *
 * Vida ultra-corta (60s) y un solo uso: el runner navega a una URL interna de la propia app
 * y necesita autenticarse SIN reenviar las cookies reales de sesión. Mismo patrón de
 * generación que el accessToken externo (`randomBytes(32).toString("hex")`), pero
 * consumible una vez.
 *
 * ── POR QUÉ (docType, docId) Y NO `businessCaseId` ───────────────────────────
 * El mecanismo nunca tuvo nada de específico de un caso de negocio; la TABLA sí. Al
 * generalizar el PDF a los ocho documentos del motor, el token identifica al documento por
 * su tipo (del registro `lib/print/doc-types.ts`) y su id, que según el tipo es un
 * businessCaseId, un projectId o un roleId.
 *
 * ── LA COMPATIBILIDAD, EN TRES CAPAS ─────────────────────────────────────────
 * La tabla es efímera (TTL 60s), pero un deploy puede caer justo en la ventana en la que un
 * token está vivo. Por eso:
 *   1. DUAL-WRITE: para "business-case" se sigue escribiendo `businessCaseId`, así que un
 *      rollback del código dentro de esos 60s no deja el token huérfano.
 *   2. LECTURA TOLERANTE: se valida contra `docType ?? "business-case"` y
 *      `docId ?? businessCaseId`, así que un token minteado por el código VIEJO se consume
 *      con el nuevo.
 *   3. La columna vieja queda DEPRECATED en el schema y se dropea cuando no queden lectores.
 */
// "crypto" (sin prefijo node:): con el prefijo, Turbopack emite un chunk externo
// llamado "[externals]_node:crypto_…" y NTFS no acepta ":" en nombres de archivo
// → el copiado del standalone falla en builds locales de Windows (EINVAL).
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";

const TTL_MS = 60_000;

/** El tipo que sigue escribiendo la columna vieja (ver capa 1). */
const TIPO_LEGACY = "business-case";

export async function createPrintJobToken(
  docType: string,
  docId: string,
  opts?: { canvasId?: string | null; createdByEmail?: string | null },
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.printJobToken.create({
    data: {
      token,
      docType,
      docId,
      // Capa 1 — dual-write. Solo para el tipo que ya usaba la columna.
      businessCaseId: docType === TIPO_LEGACY ? docId : null,
      canvasId: opts?.canvasId ?? null,
      createdByEmail: opts?.createdByEmail ?? null,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return token;
}

/**
 * Valida el token contra la DB (existe, no usado, no expirado, y el documento coincide) y
 * lo marca usado. Devuelve el `canvasId` asociado (o null = usar el activo).
 *
 * ⚠ Es de UN SOLO USO: no reintentar la navegación con el mismo token — el segundo intento
 * da 404, que es lo correcto pero confunde si no se sabe.
 */
export async function consumePrintJobToken(
  token: string,
  docType: string,
  docId: string,
): Promise<{ ok: true; canvasId: string | null } | { ok: false }> {
  const row = await prisma.printJobToken.findUnique({ where: { token } });
  if (!row) return { ok: false };
  // Capa 2 — lectura tolerante: un token del código viejo no trae docType/docId.
  const tipo = row.docType ?? TIPO_LEGACY;
  const id = row.docId ?? row.businessCaseId;
  if (tipo !== docType || id !== docId) return { ok: false };
  if (row.usedAt || row.expiresAt.getTime() < Date.now()) return { ok: false };
  await prisma.printJobToken.update({ where: { token }, data: { usedAt: new Date() } });
  return { ok: true, canvasId: row.canvasId };
}
