/**
 * lib/external/business-case-view.ts
 *
 * CHOKEPOINT de seguridad del Business Case externo. Único lugar donde un token
 * de prospecto se resuelve a los datos del caso. Corre SIEMPRE server-side (lo
 * invoca app/external/business-case/page.tsx en cada render).
 *
 * Modelo de seguridad (espejo del kickoff):
 *   1. El scoping lo da el filtro token→businessCaseId (no RLS — Prisma bypassa).
 *   2. Doble check EN CADA LECTURA: acceso no revocado (revokedAt == null) Y caso
 *      publicado (publishedAt != null). Si cualquiera falla → null (denegado). La
 *      cookie no otorga acceso por sí sola: revocar o despublicar corta en el
 *      render siguiente.
 *   3. Shape LIMPIO desde el publishedSnapshot congelado: solo { blockType,
 *      content, needsValidation } — sin status/source/ids internos.
 */
import { prisma } from "@/lib/db/prisma";
import type { BusinessCaseBlockType } from "@prisma/client";

/** Cookie httpOnly propia del business case (no choca con la del kickoff). */
export const BUSINESS_CASE_COOKIE = "nexus_bc_access";
export const BC_TOKEN_RE = /^[a-f0-9]{64}$/i;

export type BusinessCaseLandingBlock = {
  id: string;
  blockType: BusinessCaseBlockType;
  content: unknown;
  needsValidation: boolean;
};

export type BusinessCaseLandingData = {
  name: string;
  clientName: string;
  clientLogoUrl: string | null;
  blocks: BusinessCaseLandingBlock[];
};

/**
 * token → Business Case publicado de SU acceso. Devuelve el shape limpio listo
 * para render, o null si no aplica (token inválido/inexistente, revocado, o no
 * publicado). Nunca lanza por "denegado".
 */
export async function getPublishedBusinessCaseForToken(
  token: string,
): Promise<BusinessCaseLandingData | null> {
  if (!token || !BC_TOKEN_RE.test(token)) return null;

  const access = await prisma.businessCaseExternalAccess.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      revokedAt: true,
      businessCase: {
        select: {
          name: true,
          publishedAt: true,
          publishedSnapshot: true,
          client: { select: { name: true, logoUrl: true } },
        },
      },
    },
  });
  if (!access) return null;
  if (access.revokedAt) return null;

  const bc = access.businessCase;
  if (!bc.publishedAt) return null;

  const snap = bc.publishedSnapshot as unknown as Partial<BusinessCaseLandingData> | null;
  if (!snap || !Array.isArray(snap.blocks)) return null;

  // Marca de uso best-effort (no bloquea el render).
  await prisma.businessCaseExternalAccess
    .update({ where: { id: access.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    name: snap.name ?? bc.name,
    clientName: snap.clientName ?? bc.client.name,
    clientLogoUrl: snap.clientLogoUrl ?? bc.client.logoUrl,
    blocks: snap.blocks,
  };
}
