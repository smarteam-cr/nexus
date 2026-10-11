/**
 * /api/tareas/proyectos/[id]/vinculos — registros vinculados a un proyecto de tareas (docs/tareas-plan.md §4.4).
 *
 * GET    → los vínculos, con la regla de cada destino (sin título lo que no puedes abrir).
 * POST   → vincular un enlace de HubSpot, una propuesta o una preventa. Nada se escribe en HubSpot.
 * DELETE ?vinculo= → quitarlo (quien lo creó o quien administra el proyecto).
 * Las mismas reglas que en una tarea: vincular no cambia para quién es el proyecto.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarVinculosDe } from "@/lib/tareas/consultas";
import { quitarVinculoDe, vincularA } from "@/lib/tareas/mutaciones";
import { permisosDeVinculo } from "@/lib/tareas/permisos-de-vinculo";
import { Vincular } from "@/lib/tareas/schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const { id } = await params;
  try {
    return NextResponse.json({ vinculos: await cargarVinculosDe(p.ctx, p.clientes, { tipo: "proyecto", id }, await permisosDeVinculo(guard.teamMember)) });
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = Vincular.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  try {
    const permisos = await permisosDeVinculo(guard.teamMember);
    await vincularA(p.ctx, p.clientes, { tipo: "proyecto", id }, parsed.data, permisos);
    return NextResponse.json({ vinculos: await cargarVinculosDe(p.ctx, p.clientes, { tipo: "proyecto", id }, permisos) });
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const vinculo = req.nextUrl.searchParams.get("vinculo");
  if (!vinculo) return NextResponse.json({ error: "Falta el vínculo." }, { status: 400 });
  const { id } = await params;
  try {
    await quitarVinculoDe(p.ctx, { tipo: "proyecto", id }, vinculo);
    return NextResponse.json({ vinculos: await cargarVinculosDe(p.ctx, p.clientes, { tipo: "proyecto", id }, await permisosDeVinculo(guard.teamMember)) });
  } catch (e) {
    return respuestaDeError(e);
  }
}
