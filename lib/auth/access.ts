/**
 * lib/auth/access.ts
 *
 * Helper de autorización a nivel CLIENTE. Implementa la lógica exacta de la
 * sección 4.4 del ARCHITECTURE.md (recordá: el acceso se otorga a nivel
 * cliente, NO a nivel proyecto — sección 4.3).
 *
 * Orden de resolución:
 *   1. requireUser() → 401 si no logueado
 *   2. EXTERNAL: solo su propio clientId, sino 403
 *   3. INTERNAL sin TeamMember → 403
 *   4. SUPER_ADMIN → OK (reason: super-admin)
 *   5. ADMIN → OK (reason: admin)
 *   6. canViewAllClients (con expiración opcional) → OK (reason: view-all)
 *   7. ClientAssignment REVOKE → 403 (corta antes que cualquier otro permiso)
 *   8. ClientAssignment GRANT → OK (reason: granted)
 *   9. Owner en HubSpot (algún Project.hubspotOwnerEmail = email del user) → OK (reason: hubspot-owner)
 *   10. 403
 */
import { prisma } from "@/lib/db/prisma";
import {
  requireUser,
  ForbiddenError,
  type AppUserWithTeamMember,
} from "./supabase";

export type AccessReason =
  | "super-admin"
  | "admin"
  | "view-all"
  | "hubspot-owner"
  | "granted"
  | "external-owner";

export interface AccessResult {
  user: AppUserWithTeamMember;
  reason: AccessReason;
}

/**
 * Verifica que el usuario logueado tenga acceso al cliente especificado.
 * Lanza ForbiddenError (403) si no, devuelve el AppUser + la razón del acceso.
 */
export async function requireAccessToClient(clientId: string): Promise<AccessResult> {
  const user = await requireUser(); // 401 si no logueado

  // 2. EXTERNAL: solo su propio cliente
  if (user.kind === "EXTERNAL") {
    if (user.clientId && user.clientId === clientId) {
      return { user, reason: "external-owner" };
    }
    throw new ForbiddenError("Cliente externo solo puede acceder a su propio cliente");
  }

  // 3. INTERNAL necesita TeamMember
  const tm = user.teamMember;
  if (!tm) throw new ForbiddenError("Usuario interno sin TeamMember vinculado");

  // 4. SUPER_ADMIN
  if (tm.roleEnum === "SUPER_ADMIN") return { user, reason: "super-admin" };

  // 5. ADMIN
  if (tm.roleEnum === "ADMIN") return { user, reason: "admin" };

  // 6. canViewAllClients (con expiración opcional)
  if (tm.canViewAllClients) {
    const notExpired = !tm.canViewAllExpiresAt || tm.canViewAllExpiresAt > new Date();
    if (notExpired) return { user, reason: "view-all" };
  }

  // 7-8. ClientAssignment
  const assignment = await prisma.clientAssignment.findUnique({
    where: { clientId_teamMemberId: { clientId, teamMemberId: tm.id } },
    select: { kind: true },
  });
  if (assignment?.kind === "REVOKE") {
    throw new ForbiddenError("Acceso revocado explícitamente para este cliente");
  }
  if (assignment?.kind === "GRANT") return { user, reason: "granted" };

  // 9. Owner en HubSpot
  const ownerProjectCount = await prisma.project.count({
    where: { clientId, hubspotOwnerEmail: tm.email },
  });
  if (ownerProjectCount > 0) return { user, reason: "hubspot-owner" };

  // 10. Sin acceso
  throw new ForbiddenError("Sin acceso a este cliente");
}

/**
 * Variante para endpoints donde el `clientId` no viene directo en params —
 * sino que se obtiene cargando un Project, ActionItem, etc. primero.
 *
 * Uso típico en /api/projects/[projectId]/...:
 *   const project = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true }});
 *   if (!project) return notFound();
 *   const { user } = await requireAccessToClient(project.clientId);
 *
 * Si el recurso no existe (project null), devolver 404 ANTES de llamar al helper.
 */
