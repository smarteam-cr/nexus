/**
 * /api/tareas/espacios/[id] — un espacio.
 *
 * GET   → el espacio con sus miembros y sus proyectos (404 si no lo ves).
 * PATCH → renombrar, cambiar quién lo ve, archivar (sin proyectos activos), sumar o quitar a alguien. Solo un admin
 *         del espacio (o un Super Admin), y solo en uno libre: los de equipo salen del área de cada persona.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarEspacio } from "@/lib/tareas/consultas";
import { cambiarEspacio, quitarDelEspacio, sumarAlEspacio } from "@/lib/tareas/mutaciones";
import { PatchEspacio } from "@/lib/tareas/schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const { id } = await params;
  try {
    return NextResponse.json(await cargarEspacio(p.ctx, p.clientes, id));
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = PatchEspacio.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  const d = parsed.data;
  try {
    if (d.accion === "editar") await cambiarEspacio(p.ctx, id, d.version, { nombre: d.nombre, visibilidad: d.visibilidad });
    else if (d.accion === "archivar") {
      await cambiarEspacio(p.ctx, id, d.version, { archivar: true });
      return NextResponse.json({ ok: true });
    } else if (d.accion === "sumar") await sumarAlEspacio(p.ctx, id, d.email);
    else await quitarDelEspacio(p.ctx, id, d.email);
    return NextResponse.json(await cargarEspacio(p.ctx, p.clientes, id));
  } catch (e) {
    return respuestaDeError(e);
  }
}
