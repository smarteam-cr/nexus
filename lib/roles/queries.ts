/**
 * lib/roles/queries.ts — lecturas del módulo Roles (perfiles de puesto).
 * Superficie solo SUPER_ADMIN — el gate vive en las routes/páginas, no acá.
 *
 * El índice usa `loadRoles` (metadatos, liviano). La página del rol usa `getRole`
 * (incluye `content`, el mapa estructurado por sección que consume el motor de landing).
 */
import { prisma } from "@/lib/db/prisma";

/** Metadatos (sin `content`) — para el índice de administración y el sidebar. */
const ROLE_META_SELECT = {
  id: true,
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

export interface RoleNavItem {
  id: string;
  title: string;
  area: string | null;
}

/** Todos los roles (activos e inactivos), sin `content` — para el índice. */
export async function loadRoles(): Promise<RoleListRow[]> {
  return prisma.roleProfile.findMany({
    select: ROLE_META_SELECT,
    orderBy: [{ active: "desc" }, { order: "asc" }, { title: "asc" }],
  });
}

/** Un rol por id, con su `content` — para su página. null si no existe. */
export async function getRole(id: string): Promise<RoleRow | null> {
  const row = await prisma.roleProfile.findUnique({ where: { id }, select: ROLE_FULL_SELECT });
  if (!row) return null;
  return { ...row, content: (row.content ?? {}) as Record<string, unknown> };
}

/** Solo los activos, mínimos — para el submenú del sidebar. */
export async function loadRolesNav(): Promise<RoleNavItem[]> {
  return prisma.roleProfile.findMany({
    where: { active: true },
    select: { id: true, title: true, area: true },
    orderBy: [{ order: "asc" }, { title: "asc" }],
  });
}
