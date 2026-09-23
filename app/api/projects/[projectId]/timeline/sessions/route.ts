import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { prepararVinculoManual } from "@/lib/sessions/agregar-sesion";

/**
 * POST /api/projects/[projectId]/timeline/sessions — «Contexto del cronograma» (2026-09-23).
 *
 * Qué reuniones ELIGE el CSE para el CRONOGRAMA (segunda versión, 2026-09-23: ya no entran todas
 * las del proyecto — entra solo lo elegido, ver lib/timeline/session-feeding.ts):
 *   { sessionId, feeds: true }  → «Agregar»: la elige. Puede venir del calendario del CSE y no ser
 *                                 del proyecto todavía: se vincula (source=manual), con la misma
 *                                 puerta que el handoff (rechazo cross-cliente, adopción).
 *   { sessionId, feeds: false } → la X: deja de elegirla (`null`). NO la desvincula del proyecto ni
 *                                 la saca del handoff, de la Entrega ni de las minutas.
 *
 * ── EL GUARD ES EL DEL CRONOGRAMA, NO EL DEL HANDOFF ─────────────────────────
 * `guardTimelineEdit` = acceso al cliente + `cronograma.write`, la misma celda que la caja de
 * «Instrucciones adicionales» de esta pieza. El guard del handoff ataba el permiso al handoff y
 * dejaba afuera al CSE con el cliente compartido; y su veto (el handoff es del hermano mayor) no
 * aplica acá: un desarrollo hermano tiene cronograma PROPIO. Por eso esta ruta vive bajo
 * /timeline y no lleva «handoff» en el path.
 *
 * Curar no llama a la IA: no pide `generate` ni `regenerate`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { sessionId?: unknown; feeds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId || typeof body.feeds !== "boolean") {
    return NextResponse.json({ error: "sessionId y feeds (boolean) requeridos" }, { status: 400 });
  }

  /* La misma puerta que el handoff: rechazo cross-cliente, adopción de huérfanas y relectura por
     carrera viven en UN lugar (lib/sessions/agregar-sesion.ts). */
  const prep = await prepararVinculoManual({
    sessionId,
    projectId,
    clientId: guard.clientId,
    quiereIncluir: body.feeds,
    actorEmail: guard.teamMember.email ?? null,
  });
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

  if (!body.feeds) {
    /* La X: `null`, no `false`. En esta versión «no elegida» es un solo estado, y `null` además le
       devuelve el vínculo al clasificador si nada más lo lockea (session-project-locks.ts). Que el
       vínculo exista ya lo garantizó la puerta (la X sobre uno que no existe es un 409 ahí);
       `updateMany` y no `update` por si el clasificador lo borró entre medio: sacar algo que ya no
       está no es un error. */
    await prisma.sessionProject.updateMany({
      where: { sessionId, projectId },
      data: { timelineOverride: null },
    });
    return NextResponse.json({ ok: true });
  }

  await prisma.sessionProject.upsert({
    where: { sessionId_projectId: { sessionId, projectId } },
    create: { sessionId, projectId, source: "manual", timelineOverride: true },
    /* Solo el afinado del CRONOGRAMA: `handoffOverride` no se toca. Elegirla resucita un tombstone
       (`included=false`) — sin eso quedaría elegida y sin alimentar nada. */
    update: { timelineOverride: true, included: true },
  });

  return NextResponse.json({ ok: true });
}
