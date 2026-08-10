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
import { can, requirePermission, getEffectivePermissions } from "./permissions/engine";
import type { ActionKeyOf, SectionKey } from "./permissions/registry";
// isCostosRole sigue vivo: el gate de COSTOS/caja neta es SUPER_ADMIN-only
// hard-coded (más estricto que cobranza.read y NO editable por la matriz de
// permisos — los salarios no se abren desde /team). guardCostosAccess lo usa.
import { isCostosRole } from "./cobranza-roles";
import type { TeamRole } from "@prisma/client";
import { pieceByName } from "@/lib/pieces/registry";
import {
  hechosDeProyecto,
  motivoNoPublicable,
  projectCapabilities,
  type ProjectCapabilities,
} from "@/lib/projects/kind";

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
export interface ProjectGuardExtras {
  clientId: string;
  /** Qué admite este proyecto (lib/projects/kind.ts). Derivado del mismo row. */
  capacidades: ProjectCapabilities;
  /** Por qué NO se le puede publicar al cliente. `null` = sí se puede. */
  motivoNoPublicable: string | null;
  /**
   * El hecho CRUDO de si es un proyecto interno de Smarteam, no una capacidad derivada.
   *
   * Viaja aparte porque `capacidades.cobranza === false` no alcanza para preguntarlo: también da
   * false un hermano de CS y un alta a medio hacer. Y hay una decisión —a qué proyectos se les
   * ofrecen las reuniones internas del equipo— que necesita el hecho, no la consecuencia. Sale
   * del mismo row que ya se traía: cero queries nuevas.
   */
  interno: boolean;
}

export async function guardAccessToProject(
  projectId: string,
): Promise<(AccessResult & ProjectGuardExtras) | NextResponse> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    /* Las columnas de CLASE viajan en el mismo row que ya se traía: cero queries nuevas para
       los ~75 llamadores, y el que necesite preguntar "¿este proyecto se factura / se publica
       / es cartera?" ya tiene la respuesta en la mano. `altaEstado` se sumó por lo mismo: un
       proyecto con el alta a medio hacer NO es publicable, y ésta es la puerta que lo decide. */
    select: {
      clientId: true,
      hubspotPipelineId: true,
      proyectoInterno: true,
      hermanoCsProjectId: true,
      altaEstado: true,
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }
  const guard = await guardAccessToClient(project.clientId);
  if (guard instanceof NextResponse) return guard;
  const facts = hechosDeProyecto(project);
  return {
    ...guard,
    clientId: project.clientId,
    capacidades: projectCapabilities(facts),
    motivoNoPublicable: motivoNoPublicable(facts),
    interno: facts.interno,
  };
}

/**
 * Igual que `guardAccessToProject` pero además exige que al proyecto SE LE PUEDA PUBLICAR
 * contenido a un cliente. Es la puerta de ESCRITURA de `publicable`.
 *
 * ── SOLO EL POST ─────────────────────────────────────────────────────────────
 * El DELETE (despublicar) NO se gatea, y es deliberado: si un proyecto se marca interno
 * DESPUÉS de haber publicado algo, gatear el DELETE dejaría ese contenido publicado y sin
 * forma de bajarlo. El GET tampoco: la pantalla necesita renderizar el estado, y lo que
 * hace en cambio es deshabilitar el control CON el motivo — un botón deshabilitado que
 * explica enseña; uno escondido es indistinguible de un bug.
 *
 * 409 y no 403 por lo mismo que en lib/lifecycle/gate.ts: no falta un permiso, el recurso
 * no admite la operación.
 */
export async function guardPublicacionDeProyecto(
  projectId: string,
): Promise<(AccessResult & ProjectGuardExtras) | NextResponse> {
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  if (guard.capacidades.publicable) return guard;
  return NextResponse.json(
    { error: guard.motivoNoPublicable ?? "Este proyecto no admite publicación externa." },
    { status: 409 },
  );
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
): Promise<
  | (Awaited<ReturnType<typeof requireHandoffAccess>> & { clientId: string; interno: boolean })
  | NextResponse
> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    /* `proyectoInterno` viaja en el mismo row: la puerta que recibe "Agregar una sesión" necesita
       saber si el proyecto es interno para decidir si puede adoptar una reunión sin dueño. */
    select: { clientId: true, proyectoInterno: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }
  const guard = await guardHandoffAccess(project.clientId);
  if (guard instanceof NextResponse) return guard;
  return { ...guard, clientId: project.clientId, interno: project.proyectoInterno };
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
 * Acceso al paso de ENSURE del handoff (crear/reconciliar entidad+canvas ANTES de generar).
 * A diferencia de guardProjectEditHandoff — que exige `handoffAnywhere` = `handoff.write`
 * ("Editar handoff") — acá alcanza con PODER GENERAR o REGENERAR el handoff: el ensure es un
 * prerrequisito de la generación, no una edición del documento. Sin este broadening, otorgar
 * "Regenerar con IA" (handoff.regenerate) a un rol sin "Editar handoff" era inútil: el ensure
 * respondía 403 antes de llegar al gate real de IA (/analyze → resolveArtifactGate). `write`
 * también pasa (los editores). El gate FINO generate-vs-regenerate lo aplica /analyze.
 */
export async function guardProjectGenerateHandoff(
  projectId: string,
): Promise<(Awaited<ReturnType<typeof requireInternalUser>> & { clientId: string }) | NextResponse> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }
  let ctx: Awaited<ReturnType<typeof requireInternalUser>>;
  try {
    ctx = await requireInternalUser();
  } catch (e) {
    const r = toErrorResponse(e);
    if (r) return r;
    throw e;
  }
  const h = (await getEffectivePermissions(ctx.teamMember)).sections.handoff;
  const allowed = h?.write === true || h?.generate === true || h?.regenerate === true;
  if (!allowed) {
    return NextResponse.json(
      { error: `Tu rol (${ctx.role}) no puede generar el handoff (requiere Generar, Regenerar o Editar handoff).` },
      { status: 403 },
    );
  }
  return { ...ctx, clientId: project.clientId };
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
 * Aplicar la regeneración de TODO el cronograma (Tanda N, apply-all): a diferencia de
 * guardTimelineEdit (`editTimeline`, la tiene el CSE), exige `regenerateTimeline` — el MISMO
 * gate que ya protege GENERAR la propuesta (resolveArtifactGate, vía hasAiTimelineDetail).
 * Deliberado y más estricto que el apply por-fase: aplicar TODO el cronograma de una sola vez
 * tiene mucho más blast radius que una fase — no tiene sentido heredar la asimetría de
 * guardTimelineEdit (hoy inofensiva porque la UI nunca deja generar el preview a quien no
 * tiene `regenerateTimeline`; un endpoint nuevo que aplica TODO no debe depender de que la UI
 * nunca se equivoque).
 */
export async function guardTimelineFullRegen(
  projectId: string,
): Promise<(Awaited<ReturnType<typeof requireCapability>> & { clientId: string }) | NextResponse> {
  const access = await guardAccessToProject(projectId);
  if (access instanceof NextResponse) return access;
  const guard = await guardCapability("regenerateTimeline");
  if (guard instanceof NextResponse) return guard;
  return { ...guard, clientId: access.clientId };
}

/**
 * BORRAR un canvas del proyecto: acceso al CLIENTE + celda `proyectos.deleteCanvas`
 * (solo CSL y SUPER_ADMIN por default).
 *
 * Por qué existe: el borrado cascadea a secciones y bloques, sin soft-delete y sin
 * deshacer. Hasta 2026-07-24 solo pedía acceso al cliente — o sea que borrar UNA tarea
 * del cronograma exigía capacidad (`guardTimelineDelete`) y borrar el canvas entero que
 * la contiene no exigía nada. Es la misma doctrina de siempre: el CSE suspende, no borra.
 *
 * Endurecerlo no le sacó un botón a nadie: este DELETE no tiene ningún llamador en la
 * aplicación (el único fetch a esa ruta desde la UI es el PUT que agrega una sección).
 */
export async function guardProjectCanvasDelete(
  projectId: string,
): Promise<(Awaited<ReturnType<typeof requirePermission>> & { clientId: string }) | NextResponse> {
  const access = await guardAccessToProject(projectId);
  if (access instanceof NextResponse) return access;
  const guard = await guardPermission("proyectos", "deleteCanvas");
  if (guard instanceof NextResponse) return guard;
  return { ...guard, clientId: access.clientId };
}

/**
 * Para endpoints de canvas GENÉRICOS (compartidos con Kickoff/Diagnóstico): si el
 * canvas que se edita es "Handoff", exige `handoffAnywhere` (CSE no edita handoff).
 * Para cualquier otro canvas devuelve null (el endpoint ya validó acceso al proyecto).
 * Devuelve una NextResponse 403 si corresponde bloquear, o null si pasa.
 */
export async function denyHandoffCanvasEditForCse(canvasSlugOrName: string): Promise<NextResponse | null> {
  // Identidad por PIEZA: acepta el slug ("handoff") o el nombre visible ("Handoff").
  // Lo segundo sigue importando aunque el sistema ya vaya por slug — un canvas custom
  // con slug null llamado "Handoff" todavía entra en la consulta dual de canvasOf(),
  // así que renombrar hacia "Handoff" tiene que seguir pidiendo la capacidad.
  const slug = pieceByName(canvasSlugOrName)?.slug ?? canvasSlugOrName;
  if (slug !== "handoff") return null;
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
 * LAS LECTURAS PREVIAS a arrancar un proyecto: buscar una empresa por dominio en HubSpot,
 * ver qué proyectos ya tiene y traerse uno que existe allá pero no acá.
 *
 * ── POR QUÉ NO ES UNA CELDA SOLA ─────────────────────────────────────────────
 * Estas tres puertas nacieron dentro del asistente de handoff, así que exigían `handoff.create`.
 * Con el alta única hay DOS caminos legítimos que las necesitan: el asistente viejo (que
 * redacta un handoff) y el botón nuevo (que da de alta un proyecto). Y los líderes de CS
 * tienen la segunda celda pero NO la primera — o sea que sin esto la líder de CS ve el botón
 * y come un error en la primera pantalla, justo el rol que se pidió habilitar.
 *
 * Se resuelve con la pregunta real —"¿esta persona puede arrancar algo?"— en vez de ampliar
 * `handoff.create`, que le daría a CSL la capacidad de redactar handoffs por la puerta de
 * atrás y obligaría a mover las tablas congeladas de roles.
 *
 * Son LECTURAS (salvo `import-project`, que solo trae a Nexus lo que ya existe en HubSpot):
 * ninguna crea nada en el CRM. Las escrituras siguen pidiendo su celda propia.
 */
export async function guardLecturaParaArrancar(): Promise<
  Awaited<ReturnType<typeof requireInternalUser>> | NextResponse
> {
  try {
    const ctx = await requireInternalUser();
    const puede =
      (await can(ctx.teamMember, "proyectos", "create")) ||
      (await can(ctx.teamMember, "handoff", "create"));
    if (puede) return ctx;
    return NextResponse.json(
      {
        error:
          `Tu rol (${ctx.role}) no puede arrancar proyectos ni handoffs, así que no busca ` +
          "empresas en HubSpot.",
      },
      { status: 403 },
    );
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

/**
 * ROLES (perfiles de puesto del equipo): SOLO SUPER_ADMIN — docs internos de
 * dirección, gate hardcodeado fuera de la matriz de permisos (mismo criterio que
 * Costos; una sección de docs solo-SA no se delega). PRIMERA línea de TODO handler
 * bajo /api/roles.
 */
export async function guardRolesAdmin(): Promise<
  Awaited<ReturnType<typeof requireInternalUser>> | NextResponse
> {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  if (guard.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "La sección de Roles es solo para Super Admin." },
      { status: 403 },
    );
  }
  return guard;
}
