/**
 * /api/projects/[projectId]/planificacion/construccion — la lista de construcción de la Planificación en Tareas (L4 etapa 5
 * del roadmap, 2026-10-27, lib/planificacion/construccion.ts).
 *
 *   GET  ?canvasId=…               → { grupos: [{ clave, titulo, total, construidas, tarea }] }: cada grupo de la lista
 *                                    y la tarea que ya tiene (número y estado), si la mandaron.
 *   POST { canvasId, grupos? }     → crea en Tareas una tarea por grupo (los pedidos; sin `grupos`, los que tienen algo
 *                                    por construir y todavía no tienen tarea). Para quien la pide, en el proyecto y sin
 *                                    semana. Mandarla dos veces no la duplica (`origenId` por grupo).
 *
 * La lista se arma SIEMPRE del documento guardado, no de lo que mande la pantalla: el título y las notas de cada tarea
 * salen de acá. Pide acceso al proyecto, como editar el documento, y lo que pide Tareas (el equipo interno).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardInternalUser } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { crearTarea } from "@/lib/tareas/mutaciones";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cosasParaConstruir, gruposDeConstruccion, notasDelGrupo, origenIdDelGrupo, type GrupoDeConstruccion } from "@/lib/planificacion/construccion";

type Params = { params: Promise<{ projectId: string }> };

const Id = z.string().cuid();
const Cuerpo = z.strictObject({ canvasId: z.string().cuid(), grupos: z.array(z.string().min(1).max(200)).max(200).optional() });

/** La lista del documento guardado (solo la Planificación de ESTE proyecto). null si el documento no es de él. */
async function listaDelDocumento(projectId: string, canvasId: string): Promise<{ grupos: GrupoDeConstruccion[]; nombre: string } | null> {
  const canvas = await prisma.projectCanvas.findFirst({
    where: { id: canvasId, projectId, ...canvasOf("planning") },
    select: {
      project: { select: { name: true } },
      canvasSections: { select: { key: true, blocks: { where: { blockType: "CARD" }, select: { data: true }, take: 1 } } },
    },
  });
  if (!canvas) return null;
  const secciones = canvas.canvasSections.map((s) => ({ key: s.key, data: s.blocks[0]?.data ?? null }));
  return { grupos: gruposDeConstruccion(cosasParaConstruir(secciones)), nombre: canvas.project?.name ?? "Planificación" };
}

async function tareasDeLosGrupos(canvasId: string, grupos: readonly GrupoDeConstruccion[]) {
  const ids = grupos.map((g) => origenIdDelGrupo(canvasId, g.clave));
  const tareas = ids.length
    ? await prisma.tarea.findMany({ where: { origenId: { in: ids } }, select: { id: true, origenId: true, numero: true, estado: true } })
    : [];
  return new Map(tareas.map((t) => [t.origenId, { id: t.id, numero: t.numero, estado: t.estado }]));
}

export async function GET(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!Id.safeParse(projectId).success) return NextResponse.json({ error: "Proyecto inválido" }, { status: 400 });
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const canvasId = req.nextUrl.searchParams.get("canvasId") ?? "";
  if (!Id.safeParse(canvasId).success) return NextResponse.json({ error: "Documento inválido" }, { status: 400 });
  const lista = await listaDelDocumento(projectId, canvasId);
  if (!lista) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  const tareas = await tareasDeLosGrupos(canvasId, lista.grupos).catch(() => new Map());
  return NextResponse.json({
    grupos: lista.grupos.map((g) => ({
      clave: g.clave,
      titulo: g.titulo,
      total: g.cosas.length,
      construidas: g.construidas,
      tarea: tareas.get(origenIdDelGrupo(canvasId, g.clave)) ?? null,
    })),
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  if (!Id.safeParse(projectId).success) return NextResponse.json({ error: "Proyecto inválido" }, { status: 400 });
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const interno = await guardInternalUser();
  if (interno instanceof NextResponse) return interno;
  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const { canvasId } = cuerpo.data;

  const lista = await listaDelDocumento(projectId, canvasId);
  if (!lista) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  const pedido = await prepararTareas(interno);
  if (pedido instanceof NextResponse) return pedido;

  try {
    const yaTienen = await tareasDeLosGrupos(canvasId, lista.grupos);
    const pedidos = cuerpo.data.grupos ? new Set(cuerpo.data.grupos) : null;
    const aCrear = lista.grupos.filter((g) =>
      pedidos ? pedidos.has(g.clave) : g.construidas < g.cosas.length && !yaTienen.has(origenIdDelGrupo(canvasId, g.clave)),
    );
    const creadas: Array<{ clave: string; numero: number; yaExistia: boolean }> = [];
    for (const g of aCrear) {
      const t = await crearTarea(pedido.ctx, pedido.clientes, {
        titulo: g.titulo,
        notas: notasDelGrupo(g, lista.nombre),
        cuando: "sin_semana",
        clientId: guard.clientId,
        projectId,
        origen: "plantilla",
        origenId: origenIdDelGrupo(canvasId, g.clave),
      });
      creadas.push({ clave: g.clave, numero: t.numero, yaExistia: t.yaExistia || yaTienen.has(origenIdDelGrupo(canvasId, g.clave)) });
    }
    return NextResponse.json({ ok: true, creadas });
  } catch (e) {
    return respuestaDeError(e);
  }
}
