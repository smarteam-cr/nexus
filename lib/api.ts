import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import {
  guardAccessToClient,
  guardAccessToProject,
  guardInternalUser,
  guardCapability,
} from "@/lib/auth/api-guards";
import type { Capability } from "@/lib/auth/roles";

type RouteContext = { params: Promise<Record<string, string>> };
type Handler<C extends RouteContext = RouteContext> = (
  req: NextRequest,
  ctx: C
) => Promise<NextResponse | Response>;

/**
 * Wrapper que solo verifica autenticación (no ownership). Para endpoints
 * globales que no apuntan a un cliente específico.
 *
 * @deprecated en código nuevo preferir `withClientAccess` o `withProjectAccess`
 * cuando el endpoint apunte a un cliente o proyecto específico.
 */
export function withAuth<C extends RouteContext = RouteContext>(
  handler: Handler<C>
): Handler<C> {
  return async (req, ctx) => {
    try {
      await requireConsultantSession();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(req, ctx);
  };
}

/**
 * Wrapper para endpoints `/api/clients/[id]/...`. Verifica que el usuario
 * logueado tenga acceso al cliente especificado por `params.id` (vía la
 * lógica de ARCHITECTURE.md §4.4: super-admin / admin / view-all /
 * hubspot-owner / granted).
 */
export function withClientAccess<
  C extends { params: Promise<{ id: string } & Record<string, string>> },
>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const { id } = await ctx.params;
    const guard = await guardAccessToClient(id);
    if (guard instanceof NextResponse) return guard;
    return handler(req, ctx);
  };
}

/**
 * Wrapper para endpoints `/api/projects/[projectId]/...`. Carga el proyecto,
 * verifica acceso al cliente dueño. 404 si el proyecto no existe.
 */
export function withProjectAccess<
  C extends { params: Promise<{ projectId: string } & Record<string, string>> },
>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const { projectId } = await ctx.params;
    const guard = await guardAccessToProject(projectId);
    if (guard instanceof NextResponse) return guard;
    return handler(req, ctx);
  };
}

/**
 * Wrapper para endpoints que requieren un usuario INTERNAL activo (sin ownership
 * de cliente). Reemplaza a `withAuth` en endpoints internos no atados a un cliente.
 */
export function withInternal<C extends RouteContext = RouteContext>(
  handler: Handler<C>
): Handler<C> {
  return async (req, ctx) => {
    const guard = await guardInternalUser();
    if (guard instanceof NextResponse) return guard;
    return handler(req, ctx);
  };
}

/**
 * Wrapper que exige una capacidad de rol (ej. "seeAllClients", "manageTeam").
 * Uso: export const POST = withCapability("seeAllClients", async (req, ctx) => {…})
 */
export function withCapability<C extends RouteContext = RouteContext>(
  cap: Capability,
  handler: Handler<C>
): Handler<C> {
  return async (req, ctx) => {
    const guard = await guardCapability(cap);
    if (guard instanceof NextResponse) return guard;
    return handler(req, ctx);
  };
}

/**
 * Helper para extraer y parsear el body JSON de una request
 * con tipado seguro y manejo de errores.
 */
export async function parseBody<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Respuesta de error estandarizada.
 */
export function apiError(
  message: string,
  status = 500
): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
