/**
 * POST /api/escala/comentarios/[id]/estado — abierto, respondido, cambio pendiente o descartado.
 *
 * SOLO el responsable de la escala (Elías, 2026-09-27: «un estado que solo cambio yo»). Va por
 * correo y no por rol ni por la matriz de /team: ver `lib/escala/comentarios/reglas.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { autoriaPorId, cambiarEstado } from "@/lib/escala/comentarios/consultas";
import { CambiarEstado } from "@/lib/escala/comentarios/esquema";
import { errorDeValidacion, leerCuerpo, sinTablas } from "@/lib/escala/comentarios/http";
import { esResponsable } from "@/lib/escala/comentarios/reglas";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  if (!esResponsable(guard.user.email)) {
    return NextResponse.json({ error: "El estado de un comentario lo cambia solo el responsable de la escala." }, { status: 403 });
  }
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = CambiarEstado.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  const { id } = await params;
  if (!(await autoriaPorId(id))) return NextResponse.json({ error: "Ese comentario ya no existe." }, { status: 404 });
  await cambiarEstado({ comentarioId: id, datos: parsed.data, email: guard.user.email });
  return NextResponse.json({ ok: true });
}
