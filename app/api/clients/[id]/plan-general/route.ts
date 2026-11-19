/**
 * GET /api/clients/[id]/plan-general — el plan general de la cuenta (lib/plan-general): los loops de sus proyectos en
 * un solo gantt, con el estado de su enlace. Lo vivo, para el equipo; el cliente ve la foto publicada.
 * Pide acceso a la cuenta. Editar va por las rutas del cronograma de cada proyecto (misma vara: guardTimelineEdit).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardCapability } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { estadoDelAccesoAlPlan } from "@/lib/plan-general/acceso";
import { leerPlanGeneral } from "@/lib/plan-general/leer";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  try {
    const [plan, acceso, editar, borrar] = await Promise.all([
      leerPlanGeneral(id),
      estadoDelAccesoAlPlan(id),
      guardCapability("editTimeline"),
      guardCapability("deleteTimeline"),
    ]);
    // Lo que la pantalla muestra según el rol (cosmético: las rutas piden lo mismo). Como el Gantt del proyecto.
    const puede = { editar: !(editar instanceof NextResponse), borrar: !(borrar instanceof NextResponse) };
    return NextResponse.json({ plan, acceso, puede });
  } catch (e) {
    if (esquemaDesactualizado(e))
      return NextResponse.json({ error: "Falta aplicar scripts/sql/2026-11-19-plan-general-de-la-cuenta.sql y reiniciar." }, { status: 503 });
    throw e;
  }
}
