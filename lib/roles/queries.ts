/**
 * lib/roles/queries.ts — lecturas del módulo Roles (perfiles de puesto y propuestas).
 *
 * Las dos funciones EXIGEN un `subject` y aplican siempre `visibleRoleWhere`
 * (lib/roles/access.ts): SUPER_ADMIN ve todo, cualquier otro solo lo que le compartieron.
 * Es el chokepoint de lectura de un documento que lleva ofertas salariales.
 *
 * ⚠ El `subject` era OPCIONAL y eso hacía del OLVIDO el default: sin él la consulta no
 * filtraba, y olvidarlo compilaba, pasaba lint y pasaba los tests. Ahora omitirlo NO
 * COMPILA; una llamada de sistema ya gateada pasa `SYSTEM_SUBJECT` explícito, que es
 * grepeable y tiene allowlist congelada en `lib/roles/api-guards.test.ts`.
 *
 * El índice usa `loadRoles` (metadatos, liviano). La página usa `getRole` (incluye
 * `content`, el mapa estructurado por sección que consume el motor de landing).
 */
import { prisma } from "@/lib/db/prisma";
import { visibleRoleWhere, type RoleAccessSubject } from "./access";
import type { RoleDocTypeValue } from "./schema";

/** Metadatos (sin `content`) — para el índice de administración y el sidebar. */
const ROLE_META_SELECT = {
  id: true,
  docType: true,
  title: true,
  area: true,
  summary: true,
  active: true,
  order: true,
} as const;

/** Metadatos + `content` — para la página del rol. */
const ROLE_FULL_SELECT = { ...ROLE_META_SELECT, content: true } as const;

export interface RoleListRow {
  id: string;
  /** Con qué PLANTILLA se renderiza (perfil de puesto o propuesta). */
  docType: RoleDocTypeValue;
  title: string;
  area: string | null;
  summary: string | null;
  active: boolean;
  order: number;
}

export interface RoleRow extends RoleListRow {
  /** Mapa `{ [sectionKey]: data }` — la forma de cada sección la definen sus componentes. */
  content: Record<string, unknown>;
}

/**
 * Los documentos VISIBLES para quien pregunta (activos e inactivos), sin `content`.
 * El `where` sale de `visibleRoleWhere` (lib/roles/access.ts): SUPER_ADMIN ve todo, el
 * resto solo lo compartido. Para leer sin filtrar hay que pasar `SYSTEM_SUBJECT` a mano.
 */
export async function loadRoles(subject: RoleAccessSubject): Promise<RoleListRow[]> {
  return prisma.roleProfile.findMany({
    where: visibleRoleWhere(subject),
    select: ROLE_META_SELECT,
    orderBy: [{ active: "desc" }, { order: "asc" }, { title: "asc" }],
  });
}

/**
 * Un documento por id, con su `content` — para su página. null si no existe O si quien
 * pregunta no lo tiene compartido: el caller responde 404 en los dos casos, así el acceso
 * no se convierte en un oráculo de existencia.
 */
export async function getRole(id: string, subject: RoleAccessSubject): Promise<RoleRow | null> {
  const row = await prisma.roleProfile.findFirst({
    where: { id, ...visibleRoleWhere(subject) },
    select: ROLE_FULL_SELECT,
  });
  if (!row) return null;
  return { ...row, content: (row.content ?? {}) as Record<string, unknown> };
}
