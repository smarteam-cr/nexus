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
  type AccessResult,
} from "./access";
import {
  requireUser,
  requireInternalUser,
  ForbiddenError,
  UnauthorizedError,
  type AppUserWithTeamMember,
} from "./supabase";

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
