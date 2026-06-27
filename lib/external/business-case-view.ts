/**
 * lib/external/business-case-view.ts
 *
 * CHOKEPOINT de seguridad del Business Case externo. Único lugar donde un token
 * de prospecto se resuelve a los datos del caso. Corre SIEMPRE server-side.
 *
 * Doble check EN CADA LECTURA: acceso no revocado (revokedAt == null) Y caso
 * publicado (publishedAt != null). Sirve el publishedSnapshot congelado (secciones
 * + bloques CONFIRMED), sin exponer ids/estado internos.
 */
import { prisma } from "@/lib/db/prisma";

/** Cookie httpOnly propia del business case (no choca con la del kickoff). */
export const BUSINESS_CASE_COOKIE = "nexus_bc_access";
export const BC_TOKEN_RE = /^[a-f0-9]{64}$/i;

export type BusinessCaseLandingBlock = {
  blockType: string;
  content: string | null;
  data: unknown;
};
export type BusinessCaseLandingSection = {
  key: string;
  label: string;
  blocks: BusinessCaseLandingBlock[];
};
export type BusinessCaseLandingData = {
  name: string;
  clientName: string;
  clientLogoUrl: string | null;
  sections: BusinessCaseLandingSection[];
};

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
  if (!snap || !Array.isArray(snap.sections)) return null;

  await prisma.businessCaseExternalAccess
    .update({ where: { id: access.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    name: snap.name ?? bc.name,
    clientName: snap.clientName ?? bc.client.name,
    clientLogoUrl: snap.clientLogoUrl ?? bc.client.logoUrl,
    sections: snap.sections,
  };
}
