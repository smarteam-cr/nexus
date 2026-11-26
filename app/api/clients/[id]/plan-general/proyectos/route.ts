/**
 * PUT /api/clients/[id]/plan-general/proyectos { projectIds } — la lista EXPLÍCITA de proyectos del plan, entera (lo que
 * no viene sale). Solo proyectos activos de esta cuenta, que no son de prueba (lib/plan-general/plan.ts). guardPlanEdit.
 * Crea el plan si todavía no existe. DECISIONS «El plan general es un objeto de la cuenta».
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPlanEdit } from "@/lib/auth/api-guards";
import { fijarProyectosDelPlan } from "@/lib/plan-general/plan";
import { cuerpoJson, responderDelPlan } from "@/lib/plan-general/respuesta";
import { ProyectosDelPlan } from "@/lib/plan-general/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPlanEdit(id);
  if (guard instanceof NextResponse) return guard;
  const cuerpo = ProyectosDelPlan.safeParse(await cuerpoJson(req));
  if (!cuerpo.success) return NextResponse.json({ error: "projectIds debe ser una lista de proyectos" }, { status: 400 });
  return responderDelPlan(async () => {
    await fijarProyectosDelPlan(id, cuerpo.data.projectIds, guard.user.email ?? null);
    return NextResponse.json({ ok: true });
  });
}
