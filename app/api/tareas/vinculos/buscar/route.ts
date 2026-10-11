/**
 * GET /api/tareas/vinculos/buscar?q= — las propuestas comerciales y preventas que se pueden vincular a una tarea, por
 * nombre (desde 2 letras). Solo las que quien pide puede abrir.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { buscarRegistrosParaVincular } from "@/lib/tareas/consultas";
import { permisosDeVinculo } from "@/lib/tareas/permisos-de-vinculo";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
    return NextResponse.json({ registros: await buscarRegistrosParaVincular(p.clientes, q, await permisosDeVinculo(guard.teamMember)) });
  } catch (e) {
    return respuestaDeError(e);
  }
}
