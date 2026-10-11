/**
 * POST /api/tareas/vinculos/[id]/actualizar — vuelve a leer en HubSpot un registro vinculado y actualiza su foto (el
 * nombre, la etapa y la empresa). Lo puede quien puede editar la tarea o administrar el proyecto. Nada se escribe en
 * HubSpot. Devuelve la lista de vínculos de su dueño.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarVinculosDe } from "@/lib/tareas/consultas";
import { refrescarVinculo } from "@/lib/tareas/mutaciones";
import { permisosDeVinculo } from "@/lib/tareas/permisos-de-vinculo";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const { id } = await params;
  try {
    const dueno = await refrescarVinculo(p.ctx, id);
    return NextResponse.json({ vinculos: await cargarVinculosDe(p.ctx, p.clientes, dueno, await permisosDeVinculo(guard.teamMember)) });
  } catch (e) {
    return respuestaDeError(e);
  }
}
