/**
 * GET /api/projects/[projectId]/agent-runs/[runId] — EL CONTENIDO DE UNA CORRIDA.
 *
 * El detalle lazy: una fila, con su `output` YA NORMALIZADO a secciones renderizables. El JSON
 * crudo NO viaja — sin prompts, sin el `timeline` propuesto, sin `pendingItems`. Esos son
 * EFECTOS de la corrida (ya se aplicaron al proyecto), no el documento; mandarlos invitaría a
 * "restaurarlos", que es justo lo que esta función no hace.
 *
 * ⛔ ANTI-IDOR: `findFirst` CON `projectId` en el where, NUNCA `findUnique({ id })`. Tener
 * acceso a ESTE proyecto no da derecho a leer el contenido de una corrida de otro.
 */
import { NextRequest, NextResponse } from "next/server";
import { withProjectAccess } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { AGENT_GROUP_TO_CANVAS, HANDOFF_CANVAS } from "@/lib/canvas/canvas-defs";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { documentoDeCorrida } from "@/lib/canvas/agent-output-doc";
import { resumenDeCorrida } from "@/lib/agents/historial-corridas";

export const GET = withProjectAccess(
  async (_req: NextRequest, ctx: { params: Promise<{ projectId: string; runId: string }> }) => {
    const { projectId, runId } = await ctx.params;

    const run = await prisma.agentRun.findFirst({
      where: { id: runId, projectId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        triggeredByEmail: true,
        sourceSessionIds: true,
        output: true,
        agent: { select: { agentGroup: true, name: true } },
      },
    });
    if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

    /* Los rótulos salen del canvas VIVO, no de la plantilla: quien lee va a comparar contra lo
       que tiene en pantalla, y la reconciliación puede haber agregado secciones. Si el canvas
       todavía no existe, cae a la plantilla del handoff; si tampoco, el normalizador degrada
       solo (todo queda como "desconocida", rotulado con su clave). */
    const grupo = run.agent?.agentGroup ?? "handoff";
    const slug = AGENT_GROUP_TO_CANVAS[grupo];
    const filas = slug
      ? await prisma.canvasSection.findMany({
          where: { canvas: canvasOfNested(slug, { projectId }) },
          orderBy: { order: "asc" },
          select: { key: true, label: true },
        })
      : [];
    const defs = filas.length > 0 ? filas : grupo === "handoff" ? HANDOFF_CANVAS.sections : [];

    const sesiones = run.sourceSessionIds.length
      ? await prisma.firefliesSession.findMany({
          where: { id: { in: run.sourceSessionIds } },
          orderBy: { date: "desc" },
          select: { id: true, title: true, date: true },
        })
      : [];

    const nombre = run.triggeredByEmail
      ? ((
          await prisma.teamMember.findUnique({
            where: { email: run.triggeredByEmail },
            select: { name: true },
          })
        )?.name ?? null)
      : null;

    return NextResponse.json({
      ...resumenDeCorrida(run, nombre, null),
      agentName: run.agent?.name ?? null,
      /* `sesiones` es la lista hidratada; el `sesionesFuente` del resumen es su cantidad. Dos
         nombres a propósito: colisionarlos hacía que el DTO se contradijera con su propio tipo. */
      sesiones: sesiones.map((s) => ({
        id: s.id,
        title: s.title,
        date: s.date.toISOString(),
      })),
      documento: documentoDeCorrida(run.output, defs, { idPrefijo: run.id }),
    });
  },
);
