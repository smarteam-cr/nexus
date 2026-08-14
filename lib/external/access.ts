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
 *
 * ── DÓNDE VA CADA CHECK, Y POR QUÉ ───────────────────────────────────────────
 * Por SUPERFICIE → la vista (¿está publicado ESTE kickoff?). Por PROYECTO → acá
 * (¿este proyecto admite que alguien de afuera lo vea?). `publicable` es del
 * segundo tipo: no depende de qué superficie se pida, así que ponerlo en las tres
 * vistas serían tres copias, y la cuarta superficie que alguien agregue mañana
 * nacería sin él.
 *
 * ⚠ Este NO es el único lugar que resuelve un token: `/api/external/verify-access`
 * hace su propia consulta para canjear la contraseña por la cookie de 30 días y
 * NO pasa por acá. El mismo check tiene que estar en los DOS.
 */
import { prisma } from "@/lib/db/prisma";
import {
  hechosDeProyecto,
  projectCapabilities,
  type FilaParaHechos,
} from "@/lib/projects/kind";

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
    desarrolloPublishedAt: Date | null;
    entregaPublishedAt: Date | null;
    /** Empresa cliente (Client) — nombre para titulares + logo para el chrome client-facing. */
    // Los tres campos del logo viajan juntos: qué archivo, cuál variante y a qué tamaño
    // son una sola unidad visual (ver lib/ui/logo-scale.ts).
    client: { name: string; logoUrl: string | null; logoDarkUrl: string | null; logoScale: number | null };
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
          desarrolloPublishedAt: true,
          entregaPublishedAt: true,
          // De qué CLASE es el proyecto: decide si admite mirones de afuera.
          hubspotPipelineId: true,
          proyectoInterno: true,
          hermanoCsProjectId: true,
          altaEstado: true,
          // Los tres campos del logo viajan JUNTOS: qué archivo, cuál variante y a qué
          // tamaño son una sola unidad visual. Este select es el chokepoint de las TRES
          // superficies externas (kickoff, cronograma, desarrollo) — se agrega acá una vez.
          client: { select: { name: true, logoUrl: true, logoDarkUrl: true, logoScale: true } },
        },
      },
    },
  });
  if (!access) return null;

  // 2. Acceso revocado → gana sobre la cookie, en CADA lectura.
  if (access.revokedAt) return null;

  /* 3. ¿El proyecto admite publicación externa? Un proyecto interno de Smarteam no tiene
        cliente del otro lado. Devolver `null` —y no un error propio— es deliberado: para
        quien está afuera, un proyecto que dejó de ser publicable se comporta igual que un
        token revocado, sin contarle que existe. */
  if (!publicableAfuera(access.project)) return null;

  return { accessId: access.id, project: access.project };
}

/**
 * ¿Este proyecto admite que alguien de AFUERA lo mire? Compartida por los dos lugares que
 * resuelven un token (este resolver y `/api/external/verify-access`) para que no puedan
 * responder distinto.
 */
export function publicableAfuera(p: FilaParaHechos): boolean {
  return projectCapabilities(hechosDeProyecto(p)).publicable;
}

/** Marca de uso best-effort — nunca bloquea el render de la superficie. */
export async function touchAccess(accessId: string): Promise<void> {
  await prisma.projectExternalAccess
    .update({ where: { id: accessId }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
}
