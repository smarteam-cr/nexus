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
import type { Prisma } from "@prisma/client";
import {
  requireUser,
  ForbiddenError,
  type AppUserWithTeamMember,
} from "./supabase";
import { hasCapability } from "./roles";

export type AccessReason =
  | "super-admin"
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

  // 3. INTERNAL necesita TeamMember activo
  const tm = user.teamMember;
  if (!tm) throw new ForbiddenError("Usuario interno sin TeamMember vinculado");
  if (tm.deactivatedAt) throw new ForbiddenError("Tu cuenta del equipo fue desactivada");

  // 4. SUPER_ADMIN ve todo
  if (tm.roleEnum === "SUPER_ADMIN") return { user, reason: "super-admin" };

  // 5. Roles con "ve todos los clientes" (VENTAS / CSL / MARKETING)
  if (hasCapability(tm.roleEnum, "seeAllClients")) return { user, reason: "view-all" };

  // 6. Override excepcional por flag (ej. un CSE con acceso temporal a todo)
  if (tm.canViewAllClients) {
    const notExpired = !tm.canViewAllExpiresAt || tm.canViewAllExpiresAt > new Date();
    if (notExpired) return { user, reason: "view-all" };
  }

  // 7. Compartir / override: por persona (teamMemberId) o por rol (targetRole, ej.
  //    CSE = todo el equipo). Cualquier REVOKE que me alcance corta; sino GRANT da acceso.
  const assignments = await prisma.clientAssignment.findMany({
    where: { clientId, OR: [{ teamMemberId: tm.id }, { targetRole: tm.roleEnum }] },
    select: { kind: true },
  });
  if (assignments.some((a) => a.kind === "REVOKE")) {
    throw new ForbiddenError("Acceso revocado para este cliente");
  }
  if (assignments.some((a) => a.kind === "GRANT")) return { user, reason: "granted" };

  // 8. Owner en HubSpot (algún Project del cliente con su email como owner)
  const ownerProjectCount = await prisma.project.count({
    where: { clientId, hubspotOwnerEmail: tm.email },
  });
  if (ownerProjectCount > 0) return { user, reason: "hubspot-owner" };

  // 9. Sin acceso
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

/**
 * Devuelve el filtro Prisma de clientes VISIBLES para un usuario, o `null` si
 * puede ver TODOS (sin filtro). Lo usan la lista de clientes (página + API) para
 * aplicar el modelo de acceso del lado del SERVIDOR (no cosmético en el browser).
 */
export async function accessibleClientWhere(
  user: AppUserWithTeamMember,
): Promise<Prisma.ClientWhereInput | null> {
  // EXTERNAL: solo su propio cliente
  if (user.kind === "EXTERNAL") {
    return { id: user.clientId ?? "__none__" };
  }
  const tm = user.teamMember;
  if (!tm || tm.deactivatedAt) return { id: "__none__" }; // sin acceso

  // Ve todo: SUPER_ADMIN / VENTAS / CSL / MARKETING, o el flag override vigente
  if (tm.roleEnum === "SUPER_ADMIN" || hasCapability(tm.roleEnum, "seeAllClients")) return null;
  if (tm.canViewAllClients && (!tm.canViewAllExpiresAt || tm.canViewAllExpiresAt > new Date())) {
    return null;
  }

  // CSE (scoped): owner por proyecto OR GRANT (a mí o a mi rol), menos REVOKE
  const [grants, revokes] = await Promise.all([
    prisma.clientAssignment.findMany({
      where: { kind: "GRANT", OR: [{ teamMemberId: tm.id }, { targetRole: tm.roleEnum }] },
      select: { clientId: true },
    }),
    prisma.clientAssignment.findMany({
      where: { kind: "REVOKE", OR: [{ teamMemberId: tm.id }, { targetRole: tm.roleEnum }] },
      select: { clientId: true },
    }),
  ]);
  const grantedIds = grants.map((g) => g.clientId);
  const revokedIds = revokes.map((r) => r.clientId);

  const visibility: Prisma.ClientWhereInput[] = [
    { projects: { some: { hubspotOwnerEmail: tm.email } } },
  ];
  if (grantedIds.length) visibility.push({ id: { in: grantedIds } });

  return {
    AND: [
      { OR: visibility },
      ...(revokedIds.length ? [{ id: { notIn: revokedIds } }] : []),
    ],
  };
}
