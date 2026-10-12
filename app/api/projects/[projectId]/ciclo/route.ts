/**
 * El CICLO de un proyecto recurrente (docs/smartloop-plan.md, etapa 1).
 *
 * GET   → el estado: el ciclo abierto con sus casos de uso, la guía del CSE y los ciclos cerrados. Si el proyecto
 *         nunca tuvo un ciclo, abre el primero (sin formulario).
 * POST  → abre el ciclo siguiente (409 si hay uno abierto).
 * PATCH → cambia el ciclo abierto (tramo, fechas, meta, etapa) o el compromiso del servicio.
 *
 * Leer pide acceso al proyecto; escribir, además, poder editar el cronograma (`guardTimelineEdit`): el
 * ciclo es la planificación del servicio, la misma vara que el plan.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardCapability, guardTimelineEdit } from "@/lib/auth/api-guards";
import {
  ErrorDelCiclo,
  abrirCiclo,
  actualizarCiclo,
  cambiarCompromiso,
  cargarEstadoDelCiclo,
} from "@/lib/servicios/ciclos-server";
import { abrirCicloSchema, actualizarCicloSchema } from "@/lib/servicios/schema";

type Ctx = { params: Promise<{ projectId: string }> };

function error(e: unknown) {
  if (e instanceof ErrorDelCiclo) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[ciclo]", e);
  return NextResponse.json({ error: "No se pudo guardar el ciclo." }, { status: 500 });
}

const correoDe = (g: { user: { email?: string | null } }) => g.user.email ?? "desconocido";

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  try {
    const estado = await cargarEstadoDelCiclo(projectId);
    if (!estado) return NextResponse.json({ error: "Este proyecto no es de un servicio recurrente." }, { status: 404 });
    // Quien no puede editar el cronograma ve el ciclo sin controles (la misma vara que el POST y el PATCH).
    const puedeEditar = !((await guardCapability("editTimeline")) instanceof NextResponse);
    /* El primer ciclo nace solo (pedido de Elías, 2026-10-11): sin formulario para abrirlo. El tramo y las fechas
       se completan después, en la cabecera del ciclo. Solo si nunca hubo uno y quien mira puede editar. */
    if (!estado.abierto && estado.cerrados.length === 0 && puedeEditar) {
      await abrirCiclo(projectId, {}, correoDe(guard)).catch(() => null); // otra pestaña pudo abrirlo a la vez
      const recien = await cargarEstadoDelCiclo(projectId);
      if (recien) return NextResponse.json({ ...recien, puedeEditar });
    }
    return NextResponse.json({ ...estado, puedeEditar });
  } catch (e) {
    return error(e);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;
  const body = abrirCicloSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  try {
    const c = await abrirCiclo(projectId, body.data, correoDe(guard));
    return NextResponse.json({ ok: true, numero: c.numero });
  } catch (e) {
    return error(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;
  const body = actualizarCicloSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  try {
    const { compromiso, ...cambios } = body.data;
    if (compromiso !== undefined) await cambiarCompromiso(projectId, compromiso);
    if (Object.keys(cambios).length > 0) await actualizarCiclo(projectId, cambios);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return error(e);
  }
}
