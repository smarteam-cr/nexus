import { NextResponse, type NextRequest } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { buscarEnReunionesDe, MAX_RESULTADOS } from "@/lib/busqueda/buscar-server";

/**
 * GET /api/clients/[id]/buscar-en-reuniones?q=… — buscar en lo que se dijo en las reuniones con esta empresa (etapa 4c
 * de docs/mi-dia-plan.md). Solo lectura; lo ve quien tiene acceso al cliente, y solo trae reuniones de ese cliente.
 */
type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const resultados = await buscarEnReunionesDe(id, q, MAX_RESULTADOS);
  return NextResponse.json({ disponible: resultados !== null, resultados: resultados ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
