/**
 * lib/external/access.ts
 *
 * Resolución COMPARTIDA del acceso externo (Fase C / D.1.5): constantes de la
 * cookie y de la forma del token + resolveActiveAccess — el paso común de
 * TODOS los chokepoints de superficie externa (kickoff, cronograma).
 *
 * Acá viven los checks que son del ACCESO: forma del token, existencia y
 * revokedAt. Los flags de PUBLICACIÓN por superficie (kickoffPublishedAt /
 * timelinePublishedAt) NO se chequean acá a propósito: cada chokepoint hace su
 * check explícito en su propio archivo — la seguridad de cada superficie se
 * lee donde se decide, no escondida en el resolver.
 */
import { prisma } from "@/lib/db/prisma";

/** Nombre de la cookie httpOnly que transporta el token (la setea verify-access). */
export const EXTERNAL_ACCESS_COOKIE = "nexus_ext_access";

/** Forma del token: 64 chars hex (crypto.randomBytes(32)). */
export const TOKEN_RE = /^[a-f0-9]{64}$/i;

export interface ActiveAccess {
  accessId: string;
  project: {
    id: string;
    name: string;
    kickoffPublishedAt: Date | null;
    timelinePublishedAt: Date | null;
    /** Empresa cliente (Client) — nombre para titulares + logo para el chrome client-facing. */
    client: { name: string; logoUrl: string | null };
  };
}

/**
 * token → acceso ACTIVO (no revocado) → proyecto con sus flags de publicación.
 * Devuelve null si el token tiene forma inválida, no existe o está revocado —
 * nunca lanza por "denegado". El check del flag de la superficie corre en cada
 * chokepoint (la cookie de 30 días jamás otorga acceso por sí sola).
 */
export async function resolveActiveAccess(token: string): Promise<ActiveAccess | null> {
  // 0. Forma del token (evita tocar DB con basura).
  if (!token || !TOKEN_RE.test(token)) return null;

  // 1. token → acceso → proyecto (con AMBOS flags de publicación).
  const access = await prisma.projectExternalAccess.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      revokedAt: true,
      project: {
        select: {
          id: true,
          name: true,
          kickoffPublishedAt: true,
          timelinePublishedAt: true,
          client: { select: { name: true, logoUrl: true } },
        },
      },
    },
  });
  if (!access) return null;

  // 2. Acceso revocado → gana sobre la cookie, en CADA lectura.
  if (access.revokedAt) return null;

  return { accessId: access.id, project: access.project };
}

/** Marca de uso best-effort — nunca bloquea el render de la superficie. */
export async function touchAccess(accessId: string): Promise<void> {
  await prisma.projectExternalAccess
    .update({ where: { id: accessId }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
}
