/**
 * /api/projects/[projectId]/timeline/limites — los LÍMITES ACORDADOS del cronograma (2026-10-02).
 *
 *   PATCH { accion: "guardar", campo, valor, motivo?, acordadoCon?, desdeLaPropuesta? }
 *         confirma, mueve o quita la fecha límite, la duración vendida (sin la Semana 0) o las horas
 *         vendidas (2026-11-18).
 *   PATCH { accion: "descartar-propuesta", campo }
 *         descarta lo que propuso la IA para ese límite, sin tocar lo confirmado.
 *   → 200 { limites }   (lo mismo que trae el GET del cronograma)
 *
 * Quién: cualquiera que pueda editar el cronograma (Ventas, el CSL o el CSE — decisión de Elías del
 * 2026-10-02), y queda escrito quién, con su rol. Mover un límite ya confirmado es un acuerdo con el
 * cliente: pide el motivo y con quién se acordó (`validarCambioDeLimite`), y deja la razón en el
 * historial del cronograma (TimelineChange), que es también lo que muestra la cartera como el porqué.
 * Pasarse de un límite AVISA y no bloquea nada: esta ruta no toca las fases.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import {
  leerConfirmaciones,
  leerPropuestos,
  limitesDeLaFila,
  propuestosSin,
  validarCambioDeLimite,
  ymdDeFecha,
  type ConfirmacionesDeLimites,
} from "@/lib/timeline/limites";
import { cambioDeLimiteSchema } from "@/lib/timeline/limites-schema";
import { SELECT_LIMITES, conSemanaCeroDelPipeline } from "@/lib/timeline/limites-servidor";

const json = (v: unknown) => (v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue));

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = cambioDeLimiteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Pedido inválido", detalle: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const body = parsed.data;

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true, ...SELECT_LIMITES, project: { select: { hubspotPipelineId: true } } },
  });
  if (!tl?.project) return NextResponse.json({ error: "Este proyecto todavía no tiene cronograma." }, { status: 404 });
  const { hubspotPipelineId } = tl.project;

  const propuestos = leerPropuestos(tl.limitesPropuestos);
  const responder = (fila: typeof tl) =>
    NextResponse.json({
      limites: limitesDeLaFila({ ...fila, conSemanaCero: conSemanaCeroDelPipeline(hubspotPipelineId) }),
    });

  if (body.accion === "descartar-propuesta") {
    const nuevos = propuestosSin(propuestos, body.campo);
    const fila = await prisma.projectTimeline.update({
      where: { id: tl.id },
      data: { limitesPropuestos: json(nuevos) },
      select: { id: true, ...SELECT_LIMITES, project: { select: { hubspotPipelineId: true } } },
    });
    return responder(fila);
  }

  const actual =
    body.campo === "fechaLimite"
      ? ymdDeFecha(tl.fechaLimite)
      : body.campo === "horasVendidas"
        ? tl.horasVendidas
        : tl.duracionVendidaSemanas;
  const v = validarCambioDeLimite(actual, body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const propuesta =
    body.campo === "fechaLimite"
      ? propuestos?.fechaLimite
      : body.campo === "horasVendidas"
        ? propuestos?.horasVendidas
        : propuestos?.duracionVendida;
  const fuente =
    body.desdeLaPropuesta && propuesta && propuesta.valor === body.valor
      ? `Lo propuso la IA del handoff: «${propuesta.cita}»`
      : body.motivo?.trim() || null;
  const confirmacion: ConfirmacionesDeLimites = { ...leerConfirmaciones(tl.limitesConfirmacion) };
  if (body.valor === null) delete confirmacion[body.campo];
  else {
    confirmacion[body.campo] = {
      por: guard.user.email,
      nombre: guard.teamMember.name ?? null,
      rol: guard.role,
      en: new Date().toISOString(),
      fuente: body.acordadoCon ? `Acordado con ${body.acordadoCon.trim()}${fuente ? `: ${fuente}` : ""}` : fuente,
    };
  }
  const columna =
    body.campo === "fechaLimite"
      ? { fechaLimite: body.valor === null ? null : new Date(`${String(body.valor)}T00:00:00.000Z`) }
      : body.campo === "horasVendidas"
        ? { horasVendidas: body.valor === null ? null : Number(body.valor) }
        : { duracionVendidaSemanas: body.valor === null ? null : Number(body.valor) };
  // Confirmar o mover un límite resuelve lo que la IA proponía para ese campo.
  const nuevosPropuestos = propuestosSin(propuestos, body.campo);

  const fila = await prisma.$transaction(async (tx) => {
    const f = await tx.projectTimeline.update({
      where: { id: tl.id },
      data: {
        ...columna,
        limitesConfirmacion: json(Object.keys(confirmacion).length > 0 ? confirmacion : null),
        limitesPropuestos: json(nuevosPropuestos),
      },
      select: { id: true, ...SELECT_LIMITES, project: { select: { hubspotPipelineId: true } } },
    });
    await tx.timelineChange.create({
      data: {
        timelineId: tl.id,
        reason: v.reason,
        kind: "MANUAL",
        changedByEmail: guard.user.email ?? null,
        snapshot: {
          limites: {
            fechaLimite: ymdDeFecha(f.fechaLimite),
            duracionVendidaSemanas: f.duracionVendidaSemanas,
            horasVendidas: f.horasVendidas,
          },
        },
      },
    });
    return f;
  });
  return responder(fila);
}
