/**
 * GET /api/tareas/agenda/evento?id=<evento> — las tareas TUYAS unidas a ese evento de tu calendario (P3, 2026-10-27): el
 * panel de un evento en la agenda de «Para ti» las muestra y ofrece «Asociar a una tarea». Unir se hace con
 * POST /api/tareas/[id]/agenda `{ modo: "asociar", eventoId }`.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { tareasDelEvento } from "@/lib/tareas/consultas";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id || id.length > 300) return NextResponse.json({ error: "Falta el evento." }, { status: 400 });
  try {
    return NextResponse.json({ tareas: await tareasDelEvento(p.ctx, p.clientes, id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return respuestaDeError(e);
  }
}
