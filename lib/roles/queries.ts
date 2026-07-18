/**
 * lib/roles/queries.ts — lecturas del módulo Roles (perfiles de puesto).
 * Solo columnas escalares (nada de Date cruza al cliente). Superficie solo
 * SUPER_ADMIN — el gate vive en las routes/páginas, no acá.
 */
import { prisma } from "@/lib/db/prisma";

const ROLE_SELECT = {
  id: true,
  title: true,
  area: true,
  summary: true,
  profile: true,
  responsibilities: true,
  kpis: true,
  successPaths: true,
  failurePaths: true,
  maturityPath: true,
  active: true,
  order: true,
} as const;

export interface RoleRow {
  id: string;
  title: string;
  area: string | null;
  summary: string | null;
  profile: string | null;
  responsibilities: string | null;
  kpis: string | null;
  successPaths: string | null;
  failurePaths: string | null;
  maturityPath: string | null;
  active: boolean;
  order: number;
}

export interface RoleNavItem {
  id: string;
  title: string;
  area: string | null;
}

/** Todos los roles (activos e inactivos) — para el índice de administración. */
export async function loadRoles(): Promise<RoleRow[]> {
  return prisma.roleProfile.findMany({
    select: ROLE_SELECT,
    orderBy: [{ active: "desc" }, { order: "asc" }, { title: "asc" }],
  });
}

/** Un rol por id — para su página. null si no existe. */
export async function getRole(id: string): Promise<RoleRow | null> {
  return prisma.roleProfile.findUnique({ where: { id }, select: ROLE_SELECT });
}

/** Solo los activos, mínimos — para el submenú del sidebar. */
export async function loadRolesNav(): Promise<RoleNavItem[]> {
  return prisma.roleProfile.findMany({
    where: { active: true },
    select: { id: true, title: true, area: true },
    orderBy: [{ order: "asc" }, { title: "asc" }],
  });
}
