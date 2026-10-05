/**
 * /api/escala/comentarios — listar y crear comentarios de la escala.
 *
 * Comenta y lee TODO el equipo interno (Elías, 2026-09-27; lo sostuvo el 2026-10-05): pide usuario
 * interno y nada más. El ancla se valida contra la versión PUBLICADA y su texto lo congela el servidor.
 * Desde el 2026-10-05 cada comentario es un reporte de Feedback y se decide en /feedback.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { accessibleClientWhere } from "@/lib/auth/access";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import { crearComentario, listarComentarios } from "@/lib/feedback/escala-server";
import { CrearComentario, FiltroDeComentarios } from "@/lib/escala/comentarios/esquema";
import { errorDeValidacion, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/escala/comentarios/http";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const q = req.nextUrl.searchParams;
  const parsed = FiltroDeComentarios.safeParse({
    area: q.get("area") ?? undefined,
    ancla: q.get("ancla") ?? undefined,
    estado: q.get("estado") ?? undefined,
  });
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  // La versión publicada, para decir qué dice HOY el ancla de cada comentario (leída con su edición).
  const vigente = await leerEscalaVigente();
  try {
    return NextResponse.json({ comentarios: await listarComentarios(parsed.data, vigente.estado === "ok" ? vigente.escala : null) });
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = CrearComentario.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  const vigente = await leerEscalaVigente();
  if (vigente.estado !== "ok") {
    return NextResponse.json({ error: "La escala todavía no está publicada en Nexus." }, { status: 409 });
  }
  try {
    const comentario = await crearComentario({
      datos: parsed.data,
      escala: vigente.escala,
      autor: { email: guard.user.email, nombre: guard.teamMember?.name || guard.user.email, rol: guard.role ?? null },
      clientesVisibles: await accessibleClientWhere(guard.user, { kinds: "all" }),
    });
    return NextResponse.json({ comentario }, { status: 201 });
  } catch (e) {
    return respuestaDeError(e);
  }
}
