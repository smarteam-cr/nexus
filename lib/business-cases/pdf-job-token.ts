/**
 * lib/business-cases/pdf-job-token.ts
 *
 * Token de un solo uso, de vida ultra-corta (60s), para que Puppeteer autentique
 * su navegación interna a /print/business-case/[id] SIN reenviar las cookies
 * reales de sesión Supabase. Mismo patrón de generación que el accessToken de
 * BusinessCaseExternalAccess (randomBytes(32).toString("hex")), pero de un solo
 * uso: consumePdfJobToken() lo marca usado y valida expiración + businessCaseId.
 */
// "crypto" (sin prefijo node:): con el prefijo, Turbopack emite un chunk externo
// llamado "[externals]_node:crypto_…" y NTFS no acepta ":" en nombres de archivo
// → el copiado del standalone falla en builds locales de Windows (EINVAL).
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";

const TTL_MS = 60_000;

export async function createPdfJobToken(
  businessCaseId: string,
  opts?: { canvasId?: string | null; createdByEmail?: string | null },
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.printJobToken.create({
    data: {
      token,
      businessCaseId,
      canvasId: opts?.canvasId ?? null,
      createdByEmail: opts?.createdByEmail ?? null,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });
  return token;
}

/** Valida el token contra la DB (no usado, no expirado, businessCaseId coincide)
 *  y lo marca usado. Devuelve el canvasId asociado (o null = usar el activo). */
export async function consumePdfJobToken(
  token: string,
  businessCaseId: string,
): Promise<{ ok: true; canvasId: string | null } | { ok: false }> {
  const row = await prisma.printJobToken.findUnique({ where: { token } });
  if (!row || row.businessCaseId !== businessCaseId) return { ok: false };
  if (row.usedAt || row.expiresAt.getTime() < Date.now()) return { ok: false };
  await prisma.printJobToken.update({ where: { token }, data: { usedAt: new Date() } });
  return { ok: true, canvasId: row.canvasId };
}
