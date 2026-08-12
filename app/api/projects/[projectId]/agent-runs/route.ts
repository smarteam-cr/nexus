/**
 * GET /api/projects/[projectId]/agent-runs?grupo=handoff — LA LISTA DEL HISTORIAL.
 *
 * Liviana a propósito: metadata de cada corrida, SIN `output`. Veinte filas de `@db.Text` con
 * hasta ~100 KB cada una serían megabytes leídos de Postgres para pintar un badge de estado. El
 * contenido lo trae el detalle, una fila por click (mismo patrón de dos endpoints que ya usa
 * /api/sessions/analyses).
 *
 * Guard: `withProjectAccess` (acceso al cliente dueño) y nada más. Ver el handoff no está
 * gobernado por ninguna celda de permiso —el documento vivo se abre con solo tener acceso al
 * proyecto— así que exigir una para el histórico sería más estricto para lo viejo que para lo
 * actual. Y el JSON crudo no viaja: lo que sale es contenido de negocio, ya normalizado.
 */
import { NextRequest, NextResponse } from "next/server";
import { withProjectAccess } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { AGENT_GROUP_TO_CANVAS } from "@/lib/canvas/canvas-defs";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import {
  whereCorridasDeDocumento,
  resumenDeCorrida,
  LIMITE_HISTORIAL,
} from "@/lib/agents/historial-corridas";

export const GET = withProjectAccess(async (req: NextRequest, ctx) => {
  const { projectId } = await ctx.params;
  const grupo = new URL(req.url).searchParams.get("grupo") ?? "handoff";
  /* El whitelist es el MISMO mapa que usa el camino de escritura para saber en qué canvas
     escribe cada agente: no puede divergir de la realidad.
     ⚠ `Object.hasOwn` y no `mapa[clave]` (auditoría de la Tanda J): el mapa es un objeto
     literal, así que `?grupo=constructor` (o toString, valueOf, __proto__…) devolvía algo
     TRUTHY del prototipo, el 400 no cortaba, y Prisma reventaba con un slug que era una
     función → 500 y ruido en Sentry. Un tipeo honesto daba 400; una clave heredada, un 500. */
  const slug = Object.hasOwn(AGENT_GROUP_TO_CANVAS, grupo) ? AGENT_GROUP_TO_CANVAS[grupo] : null;
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: `Grupo de agente desconocido: ${grupo}` }, { status: 400 });
  }

  const where = whereCorridasDeDocumento(projectId, grupo);
  const [runs, total, bloqueVigente] = await Promise.all([
    prisma.agentRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: LIMITE_HISTORIAL,
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        triggeredByEmail: true,
        sourceSessionIds: true,
      },
    }),
    prisma.agentRun.count({ where }),
    /* Qué corrida está VIGENTE en el documento: los bloques ya guardan `agentRunId`, así que
       no hace falta ninguna columna nueva ni despertar la letra muerta de Handoff. */
    prisma.canvasBlock.findFirst({
      where: {
        source: "AGENT",
        agentRunId: { not: null },
        section: { canvas: canvasOfNested(slug, { projectId }) },
      },
      orderBy: { createdAt: "desc" },
      select: { agentRunId: true },
    }),
  ]);

  // Nombres de quienes las lanzaron, en una sola consulta (y ninguna si son todas del sistema).
  const emails = [...new Set(runs.map((r) => r.triggeredByEmail).filter((e): e is string => !!e))];
  const miembros = emails.length
    ? await prisma.teamMember.findMany({
        where: { email: { in: emails } },
        select: { email: true, name: true },
      })
    : [];
  const nombrePorEmail = new Map(miembros.map((m) => [m.email, m.name]));

  const ahora = new Date();
  return NextResponse.json({
    runs: runs.map((r) =>
      resumenDeCorrida(
        r,
        r.triggeredByEmail ? (nombrePorEmail.get(r.triggeredByEmail) ?? null) : null,
        bloqueVigente?.agentRunId ?? null,
        ahora,
      ),
    ),
    total,
    limite: LIMITE_HISTORIAL,
    runVigenteId: bloqueVigente?.agentRunId ?? null,
  });
});
