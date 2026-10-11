/**
 * GET /api/tareas/equipo/metricas?equipo=&semana= — las métricas de una semana de un sprint (lib/tareas/metricas.ts):
 * la revisión, cómo entran las tareas, qué pasó con lo que propuso Nexus y lo hecho por cliente. Solo sobre lo que
 * quien pide ve, y solo de su equipo (o de los que lidera; dirección, todos).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarMetricasDelEquipo } from "@/lib/tareas/consultas";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const sp = req.nextUrl.searchParams;
  const semana = sp.get("semana");
  try {
    return NextResponse.json(await cargarMetricasDelEquipo(p.ctx, sp.get("equipo"), semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : null));
  } catch (e) {
    return respuestaDeError(e);
  }
}
