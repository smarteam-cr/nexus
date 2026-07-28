/**
 * lib/print/job-token.ts — el pase efímero con el que Puppeteer entra a la página de
 * impresión, para CUALQUIER tipo de documento.
 *
 * Vida ultra-corta (60s): el runner navega a una URL interna de la propia app y necesita
 * autenticarse SIN reenviar las cookies reales de sesión. Mismo patrón de generación que el
 * accessToken externo (`randomBytes(32).toString("hex")`).
 *
 * ── DEJÓ DE SER DE UN SOLO USO, Y ES UN ARREGLO ──────────────────────────────
 * Lo era, y eso rompía el PDF de una forma que no se veía: si la página se vuelve a pedir
 * —el Fast Refresh de dev recarga cualquier pestaña abierta cuando se toca un archivo, y
 * Chromium reintenta una navegación fallida— la segunda vuelta daba 404, la hoja quedaba en
 * blanco, nunca aparecía `data-pdf-ready` y el usuario veía "No se pudo generar el PDF"
 * quince segundos después, sin ninguna pista.
 *
 * Lo que el un-solo-uso compraba era impedir la RE-ejecución de un token filtrado. Pero el
 * token vive 60 segundos, es de 256 bits y la URL solo existe dentro del contenedor: el TTL
 * ya acota esa ventana. Se conserva `usedAt` —la primera vez que se usó, para auditoría— y
 * lo que se saca es el RECHAZO por reuso.
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
 * Valida el token contra la DB (existe, no expirado, y el documento coincide) y anota la
 * primera vez que se usó. Devuelve el `canvasId` asociado (o null = usar el activo).
 *
 * Vale mientras no expire, así que la MISMA página se puede volver a pedir dentro de esos
 * 60 segundos — ver el encabezado: exigir un solo uso rompía el PDF ante cualquier recarga.
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
  if (row.expiresAt.getTime() < Date.now()) return { ok: false };
  // `usedAt` es la PRIMERA vez (auditoría), no un candado: no se pisa en los reusos.
  if (!row.usedAt) {
    await prisma.printJobToken.update({ where: { token }, data: { usedAt: new Date() } });
  }
  return { ok: true, canvasId: row.canvasId };
}
