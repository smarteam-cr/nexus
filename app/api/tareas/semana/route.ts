/**
 * GET /api/tareas/semana?semana=AAAA-MM-DD[&persona=correo] — una semana de una persona, para «Revisa tu semana»: sus
 * tareas de esa semana, lo que ya respondió y si la cerró. La de otra persona, solo su líder.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarSemanaDePersona } from "@/lib/tareas/consultas";
import { lunesDeHoy } from "@/lib/tareas/semana";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const semana = req.nextUrl.searchParams.get("semana");
  const persona = req.nextUrl.searchParams.get("persona") ?? p.ctx.email;
  try {
    return NextResponse.json(await cargarSemanaDePersona(p.ctx, p.clientes, persona, semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : lunesDeHoy()));
  } catch (e) {
    return respuestaDeError(e);
  }
}
