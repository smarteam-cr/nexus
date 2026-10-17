/**
 * CERRAR el ciclo abierto de un proyecto recurrente: el final de la sesión de aprendizaje (docs/smartloop-plan.md,
 * etapa 4; ficha E).
 *
 * POST → cierra el ciclo. Pide lo que pide la regla de cierre (cada caso de uso decidido, los que se cierran con su
 *        criterio medido, la meta evaluada y la propuesta del siguiente ciclo); congela los documentos del ciclo y deja
 *        el ciclo en «Ciclos anteriores». 409 con lo primero que falta.
 *
 * El borrador (lo medido, lo decidido, la meta evaluada) se guarda antes por PATCH /ciclo y PATCH /ciclo/casos.
 * Misma vara que el ciclo: acceso al proyecto y poder editar el cronograma.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { ErrorDelCiclo } from "@/lib/servicios/ciclos-server";
import { cerrarCiclo } from "@/lib/servicios/cierre-server";

type Ctx = { params: Promise<{ projectId: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;
  try {
    const r = await cerrarCiclo(projectId, guard.user.email ?? "desconocido");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ErrorDelCiclo) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[ciclo/cierre]", e);
    return NextResponse.json({ error: "No se pudo cerrar el ciclo." }, { status: 500 });
  }
}
