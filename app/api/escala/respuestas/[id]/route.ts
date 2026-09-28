/**
 * /api/escala/respuestas/[id] — editar (su autor) o borrar (su autor o el responsable) una respuesta.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { borrarRespuesta, editarRespuesta, respuestaPorId } from "@/lib/escala/comentarios/consultas";
import { EditarRespuesta } from "@/lib/escala/comentarios/esquema";
import { errorDeValidacion, leerCuerpo, sinTablas } from "@/lib/escala/comentarios/http";
import { puedeBorrarRespuesta, puedeEditarRespuesta } from "@/lib/escala/comentarios/reglas";

const NO_EXISTE = () => NextResponse.json({ error: "Esa respuesta ya no existe." }, { status: 404 });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = EditarRespuesta.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  const { id } = await params;
  const r = await respuestaPorId(id);
  if (!r) return NO_EXISTE();
  if (!puedeEditarRespuesta(r.autorEmail, guard.user.email)) {
    return NextResponse.json({ error: "Una respuesta la edita solo quien la escribió." }, { status: 403 });
  }
  await editarRespuesta(id, parsed.data.cuerpo);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const { id } = await params;
  const r = await respuestaPorId(id);
  if (!r) return NO_EXISTE();
  if (!puedeBorrarRespuesta(r.autorEmail, guard.user.email)) {
    return NextResponse.json({ error: "Una respuesta la borra quien la escribió o el responsable de la escala." }, { status: 403 });
  }
  await borrarRespuesta(id);
  return NextResponse.json({ ok: true });
}
