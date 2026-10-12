/**
 * Los CASOS DE USO del ciclo abierto (docs/smartloop-plan.md, etapa 1).
 *
 * POST  → suma un caso de uso al ciclo abierto.
 * PATCH → cambia uno ({ id, … }) o lo quita ({ id, quitar: true }: queda descartado, no se borra).
 *
 * Misma vara que el ciclo: acceso al proyecto y poder editar el cronograma.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { ErrorDelCiclo, actualizarCaso, crearCaso } from "@/lib/servicios/ciclos-server";
import { actualizarCasoSchema, crearCasoSchema } from "@/lib/servicios/schema";

type Ctx = { params: Promise<{ projectId: string }> };

function error(e: unknown) {
  if (e instanceof ErrorDelCiclo) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[ciclo/casos]", e);
  return NextResponse.json({ error: "No se pudo guardar el caso de uso." }, { status: 500 });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;
  const body = crearCasoSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  try {
    const caso = await crearCaso(projectId, body.data, guard.user.email ?? "desconocido");
    return NextResponse.json({ ok: true, id: caso.id });
  } catch (e) {
    return error(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;
  const body = actualizarCasoSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  try {
    const { id, ...datos } = body.data;
    await actualizarCaso(projectId, id, datos);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return error(e);
  }
}
