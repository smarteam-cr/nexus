/**
 * lib/roles/public-view.ts — el ÚNICO camino por el que un documento de Roles sale a la
 * web sin sesión. Espejo de `lib/external/kickoff-view.ts`.
 *
 * ── MODELO DE SEGURIDAD ──────────────────────────────────────────────────────
 * 1. El scoping NO lo da RLS (Prisma bypassa): lo da al 100% el lookup por token.
 * 2. Se re-chequea EN CADA RENDER: `publicToken` no nulo (revocar lo pone en null, así
 *    que el link viejo muere en el acto) y `active`. Por eso la página es `force-dynamic`:
 *    con el full route cache de Next, revocar no surtiría efecto.
 * 3. Shape LIMPIO: salen el tipo, el hero y el contenido. Nunca `createdByEmail`, ni el
 *    propio token, ni con quién está compartido.
 * 4. Los cuatro caminos de fallo devuelven `null`, indistinguibles entre sí: quien está
 *    afuera no puede diferenciar "token inválido" de "revocado" ni de "no existe".
 *
 * ⚠ Que `active:false` mate el link es deliberado (fail-closed), pero es un significado
 * NUEVO de "desactivar": dentro de Nexus un documento inactivo se sigue viendo. Si alguien
 * desactiva un puesto sin entender que le está cortando el link a un candidato, es acá.
 */
import { prisma } from "@/lib/db/prisma";
import type { RoleDocTypeValue } from "./schema";

/** Forma del token: 64 chars hex (crypto.randomBytes(32)). Igual que el externo. */
export const ROLE_PUBLIC_TOKEN_RE = /^[a-f0-9]{64}$/i;

export interface PublicRoleDoc {
  docType: RoleDocTypeValue;
  title: string;
  area: string | null;
  summary: string | null;
  content: Record<string, unknown>;
}

export async function getPublicRoleDoc(token: string): Promise<PublicRoleDoc | null> {
  // 0. Forma del token — evita tocar la DB con basura.
  if (!token || !ROLE_PUBLIC_TOKEN_RE.test(token)) return null;

  const row = await prisma.roleProfile.findUnique({
    where: { publicToken: token },
    select: { docType: true, title: true, area: true, summary: true, content: true, active: true },
  });
  if (!row) return null;

  // 1. Desactivado → como si no existiera (ver el ⚠ del encabezado).
  if (!row.active) return null;

  // 2. Shape limpio y EXPLÍCITO: lo que no se nombra acá no sale a la web.
  return {
    docType: row.docType,
    title: row.title,
    area: row.area,
    summary: row.summary,
    content: (row.content ?? {}) as Record<string, unknown>,
  };
}
