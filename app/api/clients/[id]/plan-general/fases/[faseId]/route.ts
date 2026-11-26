/**
 * /api/clients/[id]/plan-general/fases/[faseId] — una fase PROPIA del plan general (2026-11-26).
 *
 *   PATCH { name?, loopNumero?, startWeek?, durationWeeks?, sessionCount?, activityType? } → guardPlanEdit. Acortarla no
 *          puede dejar tareas afuera (400, INV22); las que se pasaban del final se recortan.
 *   DELETE → guardPlanDelete (todos menos el CSE: el CSE suspende, no borra). Se lleva sus tareas.
 * Solo una fase del cronograma del plan de ESTA cuenta; las fases de un proyecto se editan en su cronograma.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPlanDelete, guardPlanEdit } from "@/lib/auth/api-guards";
import { borrarFasePropia, editarFasePropia } from "@/lib/plan-general/plan";
import { cuerpoJson, responderDelPlan } from "@/lib/plan-general/respuesta";
import { CambioDeFaseDelPlan } from "@/lib/plan-general/schema";

type Ctx = { params: Promise<{ id: string; faseId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id, faseId } = await params;
  const guard = await guardPlanEdit(id);
  if (guard instanceof NextResponse) return guard;
  const cuerpo = CambioDeFaseDelPlan.safeParse(await cuerpoJson(req));
  if (!cuerpo.success) return NextResponse.json({ error: cuerpo.error.issues[0]?.message ?? "Cambio inválido" }, { status: 400 });
  return responderDelPlan(async () => {
    await editarFasePropia(id, faseId, cuerpo.data);
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, faseId } = await params;
  const guard = await guardPlanDelete(id);
  if (guard instanceof NextResponse) return guard;
  return responderDelPlan(async () => {
    await borrarFasePropia(id, faseId);
    return NextResponse.json({ ok: true });
  });
}
