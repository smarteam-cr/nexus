/**
 * lib/auth/access.ts
 *
 * Helper de autorización a nivel CLIENTE. Implementa la lógica exacta de la
 * sección 4.4 del ARCHITECTURE.md (recordá: el acceso se otorga a nivel
 * cliente, NO a nivel proyecto — sección 4.3).
 *
 * ── SOLO USUARIOS INTERNOS ────────────────────────────────────────────────────
 * Esta cadena es la de la GENTE DE SMARTEAM. El cliente final entra por otra puerta
 * completamente distinta (token + cookie `nexus_ext_access`, ver lib/external/access.ts)
 * y nunca llega acá.
 *
 * Hasta 2026-07-24 la primera línea era `requireUser()` —que acepta cualquier AppUser—
 * y más abajo había una rama `kind === "EXTERNAL"` que devolvía acceso a TODOS los
 * proyectos de "su" cliente sin mirar rol ni permisos. Hoy nadie puede alcanzarla (el
 * callback de login rechaza todo lo que no sea INTERNAL y nadie crea usuarios EXTERNAL),
 * pero era un fail-open armado: el día que se construya el login de clientes, ~42
 * endpoints —incluido el borrado de canvases— se abrían de golpe sin que nada avisara.
 *
 * Por eso la puerta ahora es `requireInternalUser()`. Si alguna vez hace falta acceso
 * externo con sesión, va por su PROPIA cadena (`requireExternalUser` + un filtro de
 * visibilidad propio), NUNCA reintroduciendo una rama por `kind` acá adentro. Hay un
 * guard que falla si vuelve a aparecer: lib/auth/project-api-guards.test.ts.
 *
 * Orden de resolución:
 *   1. requireInternalUser() → 401 si no logueado, 403 si no es interno/activo
 *   2. SUPER_ADMIN → OK (reason: super-admin)
 *   3. Permiso clientes.viewAll EFECTIVO (default VENTAS/DEV/CSL/MARKETING;
 *      editable por plantilla/overrides) → OK (reason: view-all)
 *   4. canViewAllClients flag (con expiración opcional) → OK (reason: view-all)
 *   5. ClientAssignment REVOKE → 403 (corta antes que cualquier otro permiso)
 *   6. ClientAssignment GRANT → OK (reason: granted)
 *   7. Owner en HubSpot (algún Project.hubspotOwnerEmail = email del user) → OK (reason: hubspot-owner)
 *   8. 403
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { requireInternalUser, ForbiddenError, type AppUserWithTeamMember } from "./supabase";
import { can } from "./permissions/engine";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { PROYECTO_DE_PIPELINE_CS_WHERE } from "@/lib/projects/scope";

/** Por qué se concedió el acceso. Todas las razones son de gente INTERNA: no hay —ni
 *  debe volver a haber— una razón "porque es el cliente dueño". */
export type AccessReason = "super-admin" | "view-all" | "hubspot-owner" | "granted";

export interface AccessResult {
  user: AppUserWithTeamMember;
  reason: AccessReason;
}

/**
 * Verifica que el usuario logueado tenga acceso al cliente especificado.
 * Lanza ForbiddenError (403) si no, devuelve el AppUser + la razón del acceso.
 */
export async function requireAccessToClient(clientId: string): Promise<AccessResult> {
  // 1. Interno, con TeamMember y activo. Cubre de una vez lo que antes eran tres pasos
  //    sueltos (401 sin sesión, 403 sin TeamMember, 403 desactivado) y cierra la puerta
  //    a EXTERNAL de forma estructural — ver el encabezado del archivo.
  const { user, teamMember: tm } = await requireInternalUser();

  // 2. SUPER_ADMIN ve todo
  if (tm.roleEnum === "SUPER_ADMIN") return { user, reason: "super-admin" };

  // 3. Permiso "ve todos los clientes" EFECTIVO (default: VENTAS/DEV/CSL/MARKETING)
  if (await can(tm, "clientes", "viewAll")) return { user, reason: "view-all" };

  // 4. Override excepcional por flag (ej. un CSE con acceso temporal a todo)
  if (tm.canViewAllClients) {
    const notExpired = !tm.canViewAllExpiresAt || tm.canViewAllExpiresAt > new Date();
    if (notExpired) return { user, reason: "view-all" };
  }

  // 5. Compartir / override: por persona (teamMemberId) o por rol (targetRole, ej.
  //    CSE = todo el equipo). Cualquier REVOKE que me alcance corta; sino GRANT da acceso.
  const assignments = await prisma.clientAssignment.findMany({
    where: { clientId, OR: [{ teamMemberId: tm.id }, { targetRole: tm.roleEnum }] },
    select: { kind: true },
  });
  if (assignments.some((a) => a.kind === "REVOKE")) {
    throw new ForbiddenError("Acceso revocado para este cliente");
  }
  if (assignments.some((a) => a.kind === "GRANT")) return { user, reason: "granted" };

  // 6. Owner en HubSpot (algún Project del cliente con su email como owner)
  //
  // ⭐ SOLO en el pipeline de Customer Success. "Owner" en un proyecto "development" o
  // "sitios-web" no es dueño de la cuenta — es, a veces, un desarrollador con acceso a SU
  // pipeline técnico. Sin este filtro, ese desarrollador obtenía acceso de OWNER al
  // cliente entero (Elías, 2026-08-21, viendo la columna CSE de /clients mezclar nombres).
  const ownerProjectCount = await prisma.project.count({
    where: { clientId, hubspotOwnerEmail: tm.email, ...PROYECTO_DE_PIPELINE_CS_WHERE },
  });
  if (ownerProjectCount > 0) return { user, reason: "hubspot-owner" };

  // 7. Sin acceso
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

export interface AccessibleClientOpts {
  /**
   * Qué CATEGORÍAS de empresa entran. Default: solo la cartera de CS (`CS_CLIENT_WHERE`).
   *
   * `"all"` es para la ÚNICA pantalla que necesita ver lo que no es cartera: el listado
   * de /clients, donde se re-clasifica una empresa mal marcada. Si esa pantalla no
   * pudiera verlas, un aliado marcado por error quedaría invisible y sin forma de
   * corregirse. Ningún listado de CS/cobranza/portafolio debe pasar `"all"`.
   */
  kinds?: "all";
}

/**
 * Devuelve el filtro Prisma de clientes VISIBLES para un usuario, o `null` si
 * puede ver TODOS (sin filtro). Lo usan la lista de clientes (página + API) para
 * aplicar el modelo de acceso del lado del SERVIDOR (no cosmético en el browser).
 */
export async function accessibleClientWhere(
  user: AppUserWithTeamMember,
  opts?: AccessibleClientOpts,
): Promise<Prisma.ClientWhereInput | null> {
  // El flujo con sesión es SOLO interno (ver el encabezado del archivo). Un AppUser
  // EXTERNAL no ve ningún cliente: cuando exista acceso externo con sesión, va a tener
  // su propio filtro, no esta rama. Mismo criterio que app/api/agent-runs/route.ts.
  if (user.kind === "EXTERNAL") return { id: "__none__" };
  const tm = user.teamMember;
  if (!tm || tm.deactivatedAt) return { id: "__none__" }; // sin acceso

  // Filtro de CATEGORÍA (qué ES la empresa), ortogonal al de ACCESO (a quién le toca).
  // Por default es la cartera de CS: aun "ve todo" excluye prospectos de Ventas, aliados
  // comerciales y las entidades internas de Smarteam. Sale de la fuente única
  // (lib/clients/kind.ts) — acá NO se escribe `kind` a mano.
  const kindWhere: Prisma.ClientWhereInput =
    opts?.kinds === "all" ? {} : { ...CS_CLIENT_WHERE };

  // Ve todo: SUPER_ADMIN / VENTAS / CSL / MARKETING, o el flag override vigente.
  if (tm.roleEnum === "SUPER_ADMIN" || (await can(tm, "clientes", "viewAll"))) {
    return kindWhere;
  }
  if (tm.canViewAllClients && (!tm.canViewAllExpiresAt || tm.canViewAllExpiresAt > new Date())) {
    return kindWhere;
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

  // ⭐ Mismo filtro de pipeline que en requireAccessToClient, arriba: ser owner de un
  // proyecto "development"/"sitios-web" (hijo de una implementación) no da acceso al
  // cliente entero.
  const visibility: Prisma.ClientWhereInput[] = [
    { projects: { some: { hubspotOwnerEmail: tm.email, ...PROYECTO_DE_PIPELINE_CS_WHERE } } },
  ];
  if (grantedIds.length) visibility.push({ id: { in: grantedIds } });

  return {
    AND: [
      kindWhere,
      { OR: visibility },
      ...(revokedIds.length ? [{ id: { notIn: revokedIds } }] : []),
    ],
  };
}

/**
 * IDs de clientes COMPARTIDOS con el usuario (GRANT a él o a su rol, menos REVOKE).
 * Independiente del rol "ve todo" — sirve para la pestaña "Compartidos conmigo".
 */
export async function sharedClientIdsFor(user: AppUserWithTeamMember): Promise<Set<string>> {
  const tm = user.teamMember;
  if (!tm) return new Set<string>();
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
  const ids = new Set(grants.map((g) => g.clientId));
  for (const r of revokes) ids.delete(r.clientId);
  return ids;
}

/**
 * ¿El usuario (por email) es OWNER de este cliente — owner HubSpot de algún proyecto DEL
 * PIPELINE DE CUSTOMER SUCCESS? Igual criterio que `requireAccessToClient`: un desarrollador
 * dueño de un proyecto "development"/"sitios-web" no es owner de la cuenta.
 */
export async function ownsClient(email: string, clientId: string): Promise<boolean> {
  const n = await prisma.project.count({
    where: { clientId, hubspotOwnerEmail: email, ...PROYECTO_DE_PIPELINE_CS_WHERE },
  });
  return n > 0;
}

/**
 * Acceso para CREAR/EDITAR el handoff o el cronograma de un cliente.
 * Más estricto que requireAccessToClient: tener acceso (ej. cliente compartido)
 * NO alcanza — hace falta el permiso `handoff.write` EFECTIVO (default VENTAS/
 * DEV/CSL/MARKETING/SUPER_ADMIN) O ser owner del cliente. Un CSE solo en SUS clientes.
 */
export async function requireHandoffAccess(clientId: string) {
  const ctx = await requireInternalUser(); // interno + activo (chequea deactivatedAt)
  if (await can(ctx.teamMember, "handoff", "write")) return ctx;
  if (await ownsClient(ctx.teamMember.email, clientId)) return ctx;
  throw new ForbiddenError(
    "Solo el owner del cliente (o un rol con permiso) puede editar el handoff/cronograma",
  );
}
