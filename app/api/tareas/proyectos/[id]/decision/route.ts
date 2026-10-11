/**
 * POST /api/tareas/proyectos/[id]/decision — usar o descartar un proyecto que sugirió una reunión. Lo decide quien leyó
 * la reunión o el líder del espacio. Descartado, sus tareas siguen como propuestas sueltas: salieron de líneas reales.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { decidirProyecto } from "@/lib/tareas/mutaciones";
import { DecidirProyecto } from "@/lib/tareas/schema";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = DecidirProyecto.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  try {
    await decidirProyecto(p.ctx, id, parsed.data.version, parsed.data.decision, { nombre: parsed.data.nombre, responsableEmail: parsed.data.responsableEmail });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
