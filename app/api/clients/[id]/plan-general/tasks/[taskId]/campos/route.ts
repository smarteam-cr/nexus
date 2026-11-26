/**
 * /api/clients/[id]/plan-general/tasks/[taskId]/campos — editar o borrar una tarea de una fase PROPIA del plan general.
 * Las mismas operaciones que `.../timeline/tasks/[taskId]/campos` de un proyecto (lib/timeline/una-tarea.ts):
 *   PATCH  → guardPlanEdit. Mueve la tarea solo a otra fase del cronograma del plan (nunca a un proyecto).
 *   DELETE → guardPlanDelete (el CSE suspende, no borra).
 * Sin vigía: lo transversal no es de un proyecto (DECISIONS «El plan general es un objeto de la cuenta»).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPlanDelete, guardPlanEdit } from "@/lib/auth/api-guards";
import { idDelPlan } from "@/lib/plan-general/plan";
import { cuerpoJson, responderDelPlan } from "@/lib/plan-general/respuesta";
import { borrarTarea, editarCamposDeTarea, leerCamposDeTarea } from "@/lib/timeline/una-tarea";

type Ctx = { params: Promise<{ id: string; taskId: string }> };

const NO_ESTA = () => NextResponse.json({ error: "Tarea no encontrada en este plan" }, { status: 404 });

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, taskId } = await params;
  const guard = await guardPlanEdit(id);
  if (guard instanceof NextResponse) return guard;
  const raw = await cuerpoJson(req);
  if (raw === null) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const campos = leerCamposDeTarea(raw);
  if (!campos.ok) return NextResponse.json({ error: campos.error }, { status: campos.status });
  return responderDelPlan(async () => {
    const planId = await idDelPlan(id);
    if (!planId) return NO_ESTA();
    const r = await editarCamposDeTarea({ planId }, taskId, campos.valor);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r.valor.updated);
  });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, taskId } = await params;
  const guard = await guardPlanDelete(id);
  if (guard instanceof NextResponse) return guard;
  return responderDelPlan(async () => {
    const planId = await idDelPlan(id);
    if (!planId) return NO_ESTA();
    const r = await borrarTarea({ planId }, taskId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  });
}
