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

// ── Compartir (solo lectura) ────────────────────────────────────────────────────────────

/** Con quiénes está compartido un documento. */
export async function loadRoleShares(roleId: string) {
  return prisma.roleProfileShare.findMany({
    where: { roleId },
    select: {
      id: true,
      teamMemberId: true,
      grantedByEmail: true,
      createdAt: true,
      teamMember: { select: { name: true, email: true, roleEnum: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Comparte con una persona. Idempotente por el `@@unique([roleId, teamMemberId])`:
 * compartir dos veces con la misma persona no duplica ni falla.
 */
export async function shareRoleDoc(roleId: string, teamMemberId: string, grantedByEmail: string) {
  return prisma.roleProfileShare.upsert({
    where: { roleId_teamMemberId: { roleId, teamMemberId } },
    create: { roleId, teamMemberId, grantedByEmail },
    update: {},
  });
}

/**
 * Deja de compartir. El `roleId` va en el where (no solo el id del share): sin eso, quien
 * conozca un id de share podría borrar el de OTRO documento.
 */
export async function unshareRoleDoc(roleId: string, teamMemberId: string) {
  return prisma.roleProfileShare.deleteMany({ where: { roleId, teamMemberId } });
}
