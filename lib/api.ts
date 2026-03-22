import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";

type RouteContext = { params: Promise<Record<string, string>> };
type Handler<C extends RouteContext = RouteContext> = (
  req: NextRequest,
  ctx: C
) => Promise<NextResponse | Response>;

/**
 * Wrapper que centraliza la autenticación del consultor.
 * Elimina el try/catch repetido en cada API route.
 *
 * Uso:
 *   export const GET = withAuth(async (req, { params }) => { ... });
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
