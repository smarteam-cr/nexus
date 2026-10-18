/**
 * POST /api/tareas/reuniones-planeadas — «Ya lo guardé» de un evento con cuenta (fase 2 de
 * docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17).
 *
 * La persona agendó una reunión con una cuenta desde la agenda de «Para ti» o desde «Planifica tu semana»: Nexus abrió
 * Google Calendar lleno y ella lo guardó allá (Nexus no escribe en el calendario). Acá queda la reunión planeada, una
 * tarea suya de clase «reunion» con la cuenta, la hora y los invitados, por el único escritor (`planearReunion`). Pide
 * ver la cuenta (404 si no). Repetir no duplica.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { planearReunion } from "@/lib/tareas/mutaciones";
import { PlanearReunion } from "@/lib/tareas/schema";

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = PlanearReunion.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  try {
    return NextResponse.json(await planearReunion(p.ctx, p.clientes, parsed.data));
  } catch (e) {
    return respuestaDeError(e);
  }
}
