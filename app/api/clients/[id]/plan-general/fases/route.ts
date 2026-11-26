/**
 * POST /api/clients/[id]/plan-general/fases { name, loopNumero?, startWeek, durationWeeks, activityType? } — «+ Fase del
 * plan»: una fase PROPIA del plan (lo transversal, que no es de ningún proyecto), en el cronograma del plan. guardPlanEdit
 * (la vara del cronograma). Crea el plan si todavía no existe. DECISIONS «El plan general es un objeto de la cuenta».
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPlanEdit } from "@/lib/auth/api-guards";
import { crearFasePropia } from "@/lib/plan-general/plan";
import { cuerpoJson, responderDelPlan } from "@/lib/plan-general/respuesta";
import { NuevaFaseDelPlan } from "@/lib/plan-general/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPlanEdit(id);
  if (guard instanceof NextResponse) return guard;
  const cuerpo = NuevaFaseDelPlan.safeParse(await cuerpoJson(req));
  if (!cuerpo.success) return NextResponse.json({ error: cuerpo.error.issues[0]?.message ?? "Fase inválida" }, { status: 400 });
  return responderDelPlan(async () => {
    const fase = await crearFasePropia(id, cuerpo.data, guard.user.email ?? null);
    return NextResponse.json({ fase }, { status: 201 });
  });
}
