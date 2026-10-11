/**
 * GET /api/tareas/buscar?q= — busca entre las tareas que ves, por texto o por número («T-128»).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { buscarTareas } from "@/lib/tareas/consultas";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  try {
    return NextResponse.json({ tareas: await buscarTareas(p.ctx, p.clientes, (req.nextUrl.searchParams.get("q") ?? "").slice(0, 120)) });
  } catch (e) {
    return respuestaDeError(e);
  }
}
