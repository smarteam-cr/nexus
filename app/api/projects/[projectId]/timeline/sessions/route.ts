import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { prepararVinculoManual } from "@/lib/sessions/agregar-sesion";

/**
 * POST /api/projects/[projectId]/timeline/sessions — «Contexto del cronograma» (2026-09-23).
 *
 * El afinado del CSE sobre qué reuniones alimentan al CRONOGRAMA, gemelo de handoff-sessions:
 *   { sessionId, feeds: true }  → «Agregar»: la reunión alimenta al cronograma aunque no sea
 *                                 miembro todavía (se vincula al proyecto, source=manual).
 *   { sessionId, feeds: false } → la X: sale SOLO del cronograma. NO desvincula la reunión del
 *                                 proyecto ni la saca del handoff, de la Entrega ni de las minutas.
 *
 * ── EL GUARD ES EL DEL CRONOGRAMA, NO EL DEL HANDOFF ─────────────────────────
 * `guardTimelineEdit` = acceso al cliente + `cronograma.write`, la misma celda que la caja de
 * «Instrucciones para la IA» de esta pieza. El guard del handoff ataba el permiso al handoff y
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

  /* «Reincluir» una reunión que el CSE había sacado con la X la DEVUELVE A LA REGLA (null), no la
     marca como agregada a mano: «agregada a mano» le da cupo propio y un rótulo de prioridad para
     el agente, y deshacer una X no es elegirla a propósito. `true` queda para el «Agregar» de
     verdad: una reunión que no alimentaba por regla (no era del proyecto, o estaba sacada de él). */
  const previo = await prisma.sessionProject.findUnique({
    where: { sessionId_projectId: { sessionId, projectId } },
    select: { included: true, timelineOverride: true },
  });
  const deshaceLaX = body.feeds && previo?.included === true && previo.timelineOverride === false;
  const valor: boolean | null = !body.feeds ? false : deshaceLaX ? null : true;

  await prisma.sessionProject.upsert({
    where: { sessionId_projectId: { sessionId, projectId } },
    // Solo llega acá con `feeds=true`: la X sobre un vínculo inexistente ya la rechazó la puerta.
    create: { sessionId, projectId, source: "manual", timelineOverride: body.feeds },
    /* Solo el afinado del CRONOGRAMA: `handoffOverride` no se toca. Agregar resucita un tombstone
       (`included=false`) —sin eso el override quedaría en true y la reunión seguiría sin alimentar
       nada—; la X no toca `included`, porque la reunión sigue siendo del proyecto. */
    update: { timelineOverride: valor, ...(body.feeds ? { included: true } : {}) },
  });

  return NextResponse.json({ ok: true });
}
