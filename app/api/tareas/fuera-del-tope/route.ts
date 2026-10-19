/**
 * /api/tareas/fuera-del-tope — lo que el tope de 5 por persona por reunión te dejó fuera (2026-10-19).
 *
 * GET      → las reuniones de los últimos 14 días en las que estuviste con líneas tuyas que no se propusieron.
 * POST     → { lecturaId }: «Proponérmelas». Quedan como propuestas tuyas, con su cita y su contexto: decides tú.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { loQueQuedoFueraDelTope, proponerLasQueQuedaronFuera } from "@/lib/tareas/lectura";
import { ProponerLoDeFuera } from "@/lib/tareas/schema";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  try {
    return NextResponse.json({ reuniones: await loQueQuedoFueraDelTope(p.ctx, p.clientes) });
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = ProponerLoDeFuera.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  try {
    return NextResponse.json(await proponerLasQueQuedaronFuera(p.ctx, p.clientes, parsed.data.lecturaId));
  } catch (e) {
    return respuestaDeError(e);
  }
}
