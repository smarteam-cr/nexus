/**
 * lib/roles/mutations.ts — escrituras del módulo Roles (perfiles de puesto).
 * CRUD plano, sin ciclo de publish. La IA nunca escribe por acá: el assist de
 * documento solo PROPONE y el apply pasa por el PATCH normal (curaduría humana).
 * El gate de quién administra —dirección y el CSL— vive en las routes (`guardRolesAdmin`).
 */
import type { Prisma } from "@prisma/client";
import { avisar } from "@/lib/para-ti/avisos-server";
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
  const share = await prisma.roleProfileShare.upsert({
    where: { roleId_teamMemberId: { roleId, teamMemberId } },
    create: { roleId, teamMemberId, grantedByEmail },
    update: {},
    include: { role: { select: { title: true } }, teamMember: { select: { email: true } } },
  });
  // «Para ti» (2026-10-04): a quien recibe el documento le llega un aviso. Una vez por documento y persona (el dedupe):
  // volver a compartir lo mismo no vuelve a avisar. `avisar` no lanza.
  await avisar({
    para: share.teamMember.email,
    tipo: "roles.compartido",
    titulo: `Te compartieron «${share.role.title}»`,
    detalle: "Lo puedes leer en Roles.",
    href: `/roles/${encodeURIComponent(roleId)}`,
    actorEmail: grantedByEmail,
    dedupeKey: `roles.compartido:${roleId}`,
  });
  return share;
}

/**
 * Deja de compartir. El `roleId` va en el where (no solo el id del share): sin eso, quien
 * conozca un id de share podría borrar el de OTRO documento.
 */
export async function unshareRoleDoc(roleId: string, teamMemberId: string) {
  return prisma.roleProfileShare.deleteMany({ where: { roleId, teamMemberId } });
}
