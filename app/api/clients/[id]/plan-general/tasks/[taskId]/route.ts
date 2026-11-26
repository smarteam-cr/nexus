/**
 * PATCH /api/clients/[id]/plan-general/tasks/[taskId] { status } — el estado de una tarea de una fase PROPIA del plan,
 * con la coherencia de su fase. La misma operación que el PATCH de la tarea de un proyecto (lib/timeline/una-tarea.ts) y
 * la misma vara (guardPlanEdit). Sin vigía ni «¿cuánto te tomó?»: son de un proyecto (DECISIONS «El plan general es un
 * objeto de la cuenta»).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPlanEdit } from "@/lib/auth/api-guards";
import { idDelPlan } from "@/lib/plan-general/plan";
import { cuerpoJson, responderDelPlan } from "@/lib/plan-general/respuesta";
import { cambiarEstadoDeTarea, leerEstado } from "@/lib/timeline/una-tarea";

type Ctx = { params: Promise<{ id: string; taskId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, taskId } = await params;
  const guard = await guardPlanEdit(id);
  if (guard instanceof NextResponse) return guard;
  const raw = await cuerpoJson(req);
  if (raw === null) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const estado = leerEstado(raw);
  if (!estado.ok) return NextResponse.json({ error: estado.error }, { status: estado.status });
  return responderDelPlan(async () => {
    const planId = await idDelPlan(id);
    if (!planId) return NextResponse.json({ error: "Tarea no encontrada en este plan" }, { status: 404 });
    const r = await cambiarEstadoDeTarea({ planId }, taskId, estado.valor, guard.user.email ?? null);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ...r.valor.updated, preguntasDeTiempo: [] });
  });
}
