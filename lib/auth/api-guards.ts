/**
 * lib/auth/api-guards.ts
 *
 * Wrappers de `requireAccessToClient` y `requireInternalUser` que devuelven
 * directamente una NextResponse de error (401/403) en vez de lanzar — para
 * usar en API routes con el patrón:
 *
 *   const guard = await guardAccessToClient(clientId);
 *   if (guard instanceof Response) return guard;
 *   const { user, reason } = guard;
 *   // ... resto del handler
 *
 * Esto evita el try/catch repetitivo en cada route.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  requireAccessToClient,
  requireHandoffAccess,
  type AccessResult,
} from "./access";
import {
  requireUser,
  requireInternalUser,
  ForbiddenError,
  UnauthorizedError,
  type AppUserWithTeamMember,
} from "./supabase";
import { requireCapability, requireRole, type Capability } from "./roles";
import { can, requirePermission } from "./permissions/engine";
import type { ActionKeyOf, SectionKey } from "./permissions/registry";
// isCostosRole sigue vivo: el gate de COSTOS/caja neta es SUPER_ADMIN-only
// hard-coded (más estricto que cobranza.read y NO editable por la matriz de
// permisos — los salarios no se abren desde /team). guardCostosAccess lo usa.
import { isCostosRole } from "./cobranza-roles";
import type { TeamRole } from "@prisma/client";

function toErrorResponse(e: unknown): NextResponse | null {
  if (e instanceof UnauthorizedError) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
  if (e instanceof ForbiddenError) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
  return null;
}

/**
 * Verifica acceso al cliente dado. Devuelve { user, reason } o una NextResponse
 * 401/403 lista para retornar desde el handler.
 */
export async function guardAccessToClient(
  clientId: string,
): Promise<AccessResult | NextResponse> {
  try {
    return await requireAccessToClient(clientId);
  } catch (e) {
    const r = toErrorResponse(e);
    if (r) return r;
    throw e;
  }
}

/**
 * Solo verifica que haya un usuario logueado (sin chequeo de ownership de
 * cliente). Útil para endpoints globales no atados a un cliente específico.
 */
export async function guardUser(): Promise<AppUserWithTeamMember | NextResponse> {
  try {
    return await requireUser();
  } catch (e) {
    const r = toErrorResponse(e);
    if (r) return r;
    throw e;
  }
}

/**
 * Verifica que haya un usuario INTERNAL logueado. Devuelve el bundle o una
 * NextResponse 401/403.
 */
export async function guardInternalUser(): Promise<
  Awaited<ReturnType<typeof requireInternalUser>> | NextResponse
> {
  try {
    return await requireInternalUser();
  } catch (e) {
    const r = toErrorResponse(e);
    if (r) return r;
    throw e;
  }
}

/**
 * Verifica que haya un usuario INTERNAL con la capacidad dada (ej. "manageTeam").
 * Devuelve el bundle o una NextResponse 401/403.
 */
export async function guardCapability(
  cap: Capability,
): Promise<Awaited<ReturnType<typeof requireCapability>> | NextResponse> {
  try {
    return await requireCapability(cap);
  } catch (e) {
    const r = toErrorResponse(e);
    if (r) return r;
    throw e;
  }
}

/**
 * Verifica que haya un usuario INTERNAL con rol mínimo (por rango, ej.
 * "SUPER_ADMIN"). Devuelve el bundle o una NextResponse 401/403.
 */
export async function guardRole(
  min: TeamRole,
): Promise<Awaited<ReturnType<typeof requireRole>> | NextResponse> {
  try {
    return await requireRole(min);
  } catch (e) {
    const r = toErrorResponse(e);
    if (r) return r;
    throw e;
  }
}

/**
 * Atajo para endpoints `/api/projects/[projectId]/...`: carga el proyecto,
 * verifica acceso al cliente dueño, y devuelve el bundle de acceso + el
 * clientId resuelto. Devuelve NextResponse 404 si el proyecto no existe.
 */
export async function guardAccessToProject(
  projectId: string,
): Promise<(AccessResult & { clientId: string }) | NextResponse> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }
  const guard = await guardAccessToClient(project.clientId);
  if (guard instanceof NextResponse) return guard;
  return { ...guard, clientId: project.clientId };
}

/**
 * Acceso para editar handoff/cronograma de un cliente (handoffAnywhere || owner).
 * Devuelve el bundle de requireInternalUser o una NextResponse 401/403.
 */
export async function guardHandoffAccess(
  clientId: string,
): Promise<Awaited<ReturnType<typeof requireHandoffAccess>> | NextResponse> {
  try {
    return await requireHandoffAccess(clientId);
  } catch (e) {
    const r = toErrorResponse(e);
    if (r) return r;
    throw e;
  }
}

/**
 * Igual que guardHandoffAccess pero a partir de un projectId: carga el proyecto,
 * resuelve su clientId y exige handoff-access. 404 si el proyecto no existe.
 */
export async function guardProjectHandoffAccess(
  projectId: string,
): Promise<(Awaited<ReturnType<typeof requireHandoffAccess>> & { clientId: string }) | NextResponse> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }
  const guard = await guardHandoffAccess(project.clientId);
  if (guard instanceof NextResponse) return guard;
  return { ...guard, clientId: project.clientId };
}

/**
 * Edición del HANDOFF (NO del cronograma): exige la capacidad `handoffAnywhere`
 * (VENTAS/CSL/MARKETING/SUPER_ADMIN). A diferencia de guardProjectHandoffAccess
 * NO hay fallback de owner — un CSE NO edita handoffs ni en sus propios clientes.
 * El cronograma sigue usando guardProjectHandoffAccess (owner sí lo edita).
 */
export async function guardProjectEditHandoff(
  projectId: string,
): Promise<(Awaited<ReturnType<typeof requireCapability>> & { clientId: string }) | NextResponse> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }
  const guard = await guardCapability("handoffAnywhere");
  if (guard instanceof NextResponse) return guard;
  return { ...guard, clientId: project.clientId };
}

/**
 * Edición/movimiento del CRONOGRAMA (estructura + tareas): DOS chequeos —
 *   1) acceso al CLIENTE del proyecto (`guardAccessToProject` → `requireAccessToClient`):
 *      el CSE solo en SUS clientes; VENTAS/CSL/MARKETING/SUPER_ADMIN en todos (seeAllClients).
 *   2) capacidad `editTimeline` (la tiene TODO interno, incluido el CSE — edita/mueve/
 *      renombra/estado/fechas). Lo único reservado a no-CSE es BORRAR (guardTimelineDelete).
 * El check de acceso es lo que evita que un CSE edite el cronograma de un cliente ajeno
 * con solo conocer el projectId. 404 si el proyecto no existe; 401/403 si falta acceso o capacidad.
 */
export async function guardTimelineEdit(
  projectId: string,
): Promise<(Awaited<ReturnType<typeof requireCapability>> & { clientId: string }) | NextResponse> {
  const access = await guardAccessToProject(projectId);
  if (access instanceof NextResponse) return access;
  const guard = await guardCapability("editTimeline");
  if (guard instanceof NextResponse) return guard;
  return { ...guard, clientId: access.clientId };
}

/**
 * BORRAR del cronograma (tareas/fases/cronograma entero): acceso al CLIENTE del proyecto
 * (igual scope que la edición) + capacidad `deleteTimeline` (todos menos el CSE — el CSE
 * suspende, no borra). 404 si el proyecto no existe; 401/403 si falta acceso o capacidad.
 */
export async function guardTimelineDelete(
  projectId: string,
): Promise<(Awaited<ReturnType<typeof requireCapability>> & { clientId: string }) | NextResponse> {
  const access = await guardAccessToProject(projectId);
  if (access instanceof NextResponse) return access;
  const guard = await guardCapability("deleteTimeline");
  if (guard instanceof NextResponse) return guard;
  return { ...guard, clientId: access.clientId };
}

/**
 * Para endpoints de canvas GENÉRICOS (compartidos con Kickoff/Diagnóstico): si el
 * canvas que se edita es "Handoff", exige `handoffAnywhere` (CSE no edita handoff).
 * Para cualquier otro canvas devuelve null (el endpoint ya validó acceso al proyecto).
 * Devuelve una NextResponse 403 si corresponde bloquear, o null si pasa.
 */
export async function denyHandoffCanvasEditForCse(canvasName: string): Promise<NextResponse | null> {
  if (canvasName !== "Handoff") return null;
  const guard = await guardCapability("handoffAnywhere");
  return guard instanceof NextResponse ? guard : null;
}

/**
 * Verifica que haya un usuario INTERNAL con la celda sección.acción del sistema
 * de permisos (lib/auth/permissions — default ← plantilla DB ← overrides).
 * Devuelve el bundle de requireInternalUser o una NextResponse 401/403.
 */
export async function guardPermission<S extends SectionKey>(
  section: S,
  action: ActionKeyOf<S>,
): Promise<Awaited<ReturnType<typeof requirePermission>> | NextResponse> {
  try {
    return await requirePermission(section, action);
  } catch (e) {
    const r = toErrorResponse(e);
    if (r) return r;
    throw e;
  }
}

/**
 * Acceso al área de VENTAS (Business Cases). Consulta la celda `ventas.read`
 * del mapa EFECTIVO (default = VENTAS/DEV/CSL/SUPER_ADMIN — la vieja whitelist
 * SALES_AREA_ROLES; editable por plantilla/overrides desde /team).
 * Devuelve el bundle de usuario interno o una NextResponse 401/403.
 */
export async function guardSalesAccess(): Promise<
  Awaited<ReturnType<typeof requireInternalUser>> | NextResponse
> {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  if (!(await can(guard.teamMember, "ventas", "read"))) {
    return NextResponse.json(
      { error: "Tu rol no tiene acceso al área de Ventas." },
      { status: 403 },
    );
  }
  return guard;
}

/**
 * ESCRITURA en el área de Marketing + Contenido (CRUD de insumos, correr
 * ingesta/agente, podar/aprobar salidas). Consulta la celda `marketing.write`
 * del mapa EFECTIVO (default = MARKETING/CSL/SUPER_ADMIN — la vieja whitelist
 * MARKETING_EDITOR_ROLES). La LECTURA del área es de todo rol interno → los
 * GET usan `guardInternalUser`.
 */
export async function guardMarketingEditor(): Promise<
  Awaited<ReturnType<typeof requireInternalUser>> | NextResponse
> {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  if (!(await can(guard.teamMember, "marketing", "write"))) {
    return NextResponse.json(
      { error: "Tu rol no puede editar el área de Marketing." },
      { status: 403 },
    );
  }
  return guard;
}

/**
 * Acceso al módulo COBRANZA (cartera de cobros — Admin & Finanzas). Consulta la
 * celda `cobranza.read` del mapa EFECTIVO (default = ADMIN/SUPER_ADMIN — la
 * vieja whitelist COBRANZA_ROLES; info sensible de Finanzas).
 * Devuelve el bundle de usuario interno o una NextResponse 401/403.
 */
export async function guardCobranzaAccess(): Promise<
  Awaited<ReturnType<typeof requireInternalUser>> | NextResponse
> {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  if (!(await can(guard.teamMember, "cobranza", "read"))) {
    return NextResponse.json(
      { error: "Tu rol no tiene acceso a Cobranza." },
      { status: 403 },
    );
  }
  return guard;
}

/**
 * COSTOS RECURRENTES + CAJA NETA (Cobranza fase 4): SOLO dirección
 * (SUPER_ADMIN, fuente única `COSTOS_ROLES`). Los salarios estimados son la
 * información más sensible del sistema — ADMIN NO pasa ni por API, y esta capa
 * es LA barrera (Prisma conecta con rol BYPASSRLS: RLS no protege del interno).
 * PRIMERA línea de TODO handler bajo /api/cobranza/costos* y /caja-neta — hay
 * un test estructural que lo verifica.
 */
export async function guardCostosAccess(): Promise<
  Awaited<ReturnType<typeof requireInternalUser>> | NextResponse
> {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  if (!isCostosRole(guard.role)) {
    return NextResponse.json(
      { error: "Los costos y la caja neta son solo para dirección (Super Admin)." },
      { status: 403 },
    );
  }
  return guard;
}
