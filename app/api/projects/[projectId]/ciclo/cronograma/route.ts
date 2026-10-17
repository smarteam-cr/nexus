/**
 * El CRONOGRAMA DEL CICLO abierto de un proyecto recurrente (docs/smartloop-plan.md, etapa 3; ficha E).
 *
 * GET  → cada caso de uso del ciclo como fase: sus semanas, su avance, sus dependencias del cliente, la propuesta si una
 *        dependencia se atrasó, y la versión aprobada con lo que cambió desde ahí.
 * POST → { accion: "armar" }                       cada caso sin fase pasa a ser una fase que ocupa el ciclo.
 *        { accion: "dependencia", casoId, titulo }  suma una dependencia del cliente al caso (sin crear tareas).
 *        { accion: "correr", casoId }               aplica la propuesta por una dependencia atrasada (un clic).
 *        { accion: "aprobar" }                      guarda la versión aprobada: lo que se le presentó al cliente.
 *
 * Leer pide acceso al proyecto; escribir, poder editar el cronograma (la misma vara que el ciclo).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardCapability, guardTimelineEdit } from "@/lib/auth/api-guards";
import { ErrorDelCiclo } from "@/lib/servicios/ciclos-server";
import {
  agregarDependencia,
  aplicarPropuestaDeDependencia,
  aprobarCronogramaDelCiclo,
  armarFasesDelCiclo,
  cargarCronogramaDelCiclo,
} from "@/lib/servicios/cronograma-del-ciclo-server";
import { accionDelCronogramaSchema } from "@/lib/servicios/schema";

type Ctx = { params: Promise<{ projectId: string }> };

function error(e: unknown) {
  if (e instanceof ErrorDelCiclo) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[ciclo/cronograma]", e);
  return NextResponse.json({ error: "No se pudo guardar el cronograma del ciclo." }, { status: 500 });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  try {
    const vista = await cargarCronogramaDelCiclo(projectId);
    const puedeEditar = !((await guardCapability("editTimeline")) instanceof NextResponse);
    return NextResponse.json({ vista, puedeEditar });
  } catch (e) {
    return error(e);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;
  const body = accionDelCronogramaSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  const por = guard.user.email ?? "desconocido";
  try {
    const d = body.data;
    switch (d.accion) {
      case "armar":
        return NextResponse.json({ ok: true, ...(await armarFasesDelCiclo(projectId, por)) });
      case "dependencia":
        return NextResponse.json({ ok: true, ...(await agregarDependencia(projectId, d.casoId, { titulo: d.titulo, semana: d.semana }, por)) });
      case "correr":
        return NextResponse.json({ ok: true, ...(await aplicarPropuestaDeDependencia(projectId, d.casoId, por)) });
      case "aprobar":
        return NextResponse.json({ ok: true, ...(await aprobarCronogramaDelCiclo(projectId, por)) });
    }
  } catch (e) {
    return error(e);
  }
}
