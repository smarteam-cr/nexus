/**
 * POST /api/clients/[id]/plan-general/tasks — «+ tarea» en una fase PROPIA del plan general. La misma operación que
 * `POST /api/projects/[projectId]/timeline/tasks` (lib/timeline/una-tarea.ts), con el cronograma buscado por el plan de
 * ESTA cuenta y la misma vara (guardPlanEdit = acceso a la cuenta + editTimeline). Sin vigía: lo transversal no es de un
 * proyecto (DECISIONS «El plan general es un objeto de la cuenta»).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPlanEdit } from "@/lib/auth/api-guards";
import { idDelPlan } from "@/lib/plan-general/plan";
import { cuerpoJson, responderDelPlan } from "@/lib/plan-general/respuesta";
import { crearTarea, leerPedidoDeTarea } from "@/lib/timeline/una-tarea";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPlanEdit(id);
  if (guard instanceof NextResponse) return guard;
  const raw = await cuerpoJson(req);
  if (raw === null) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const pedido = leerPedidoDeTarea(raw);
  if (!pedido.ok) return NextResponse.json({ error: pedido.error }, { status: pedido.status });
  return responderDelPlan(async () => {
    const planId = await idDelPlan(id);
    if (!planId) return NextResponse.json({ error: "Fase no encontrada en este plan" }, { status: 404 });
    const r = await crearTarea({ planId }, pedido.valor);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ task: r.valor.task }, { status: 201 });
  });
}
