/**
 * /api/clients/[id]/plan-general — el plan general de la cuenta (lib/plan-general).
 *
 *   GET   → el plan (las fases propias y los loops de sus proyectos en un solo gantt), el estado de su enlace, los
 *           proyectos de la cuenta que se pueden sumar y qué puede hacer quien mira. Lo vivo, para el equipo; el
 *           cliente ve la foto publicada. Pide acceso a la cuenta.
 *   PATCH { arranque: "AAAA-MM-DD" | null } → el arranque del plan (el de su cronograma; null = el de sus proyectos).
 *           guardPlanEdit (la vara del cronograma). Crea el plan si todavía no existe.
 * Las tareas de un loop se editan por las rutas del cronograma de su proyecto; las de una fase propia, por
 * `plan-general/tasks` (las dos con la misma vara: guardTimelineEdit / guardPlanEdit). DECISIONS «El plan general es un
 * objeto de la cuenta».
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardCapability, guardPlanEdit } from "@/lib/auth/api-guards";
import { estadoDelAccesoAlPlan } from "@/lib/plan-general/acceso";
import { leerPlanGeneral, proyectosParaElegir } from "@/lib/plan-general/leer";
import { fijarArranqueDelPlan } from "@/lib/plan-general/plan";
import { cuerpoJson, responderDelPlan } from "@/lib/plan-general/respuesta";
import { ArranqueDelPlan } from "@/lib/plan-general/schema";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  return responderDelPlan(async () => {
    const [plan, acceso, opciones, editar, borrar] = await Promise.all([
      leerPlanGeneral(id),
      estadoDelAccesoAlPlan(id),
      proyectosParaElegir(id),
      guardCapability("editTimeline"),
      guardCapability("deleteTimeline"),
    ]);
    // Lo que la pantalla muestra según el rol (cosmético: las rutas piden lo mismo). Como el Gantt del proyecto.
    const puede = { editar: !(editar instanceof NextResponse), borrar: !(borrar instanceof NextResponse) };
    return NextResponse.json({ plan, acceso, opciones, puede });
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPlanEdit(id);
  if (guard instanceof NextResponse) return guard;
  const cuerpo = ArranqueDelPlan.safeParse(await cuerpoJson(req));
  if (!cuerpo.success) return NextResponse.json({ error: cuerpo.error.issues[0]?.message ?? "Arranque inválido" }, { status: 400 });
  return responderDelPlan(async () => {
    await fijarArranqueDelPlan(id, cuerpo.data.arranque, guard.user.email ?? null);
    return NextResponse.json({ ok: true });
  });
}
