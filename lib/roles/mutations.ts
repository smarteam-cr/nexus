/**
 * lib/roles/mutations.ts — escrituras del módulo Roles (perfiles de puesto).
 * CRUD plano, sin ciclo de publish. La IA nunca escribe por acá: el assist de
 * documento solo PROPONE y el apply pasa por el PATCH normal (curaduría humana).
 * El gate solo-SUPER_ADMIN vive en las routes (`guardRolesAdmin`).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function createRole(data: Prisma.RoleProfileCreateInput) {
  return prisma.roleProfile.create({ data });
}

export async function updateRole(id: string, data: Prisma.RoleProfileUpdateInput) {
  return prisma.roleProfile.update({ where: { id }, data });
}

export async function deleteRole(id: string) {
  return prisma.roleProfile.delete({ where: { id } });
}
