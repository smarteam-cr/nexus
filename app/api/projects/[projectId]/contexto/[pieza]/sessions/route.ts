import { NextRequest, NextResponse } from "next/server";
import { guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { prepararVinculoManual } from "@/lib/sessions/agregar-sesion";
import { documentoConContexto } from "@/lib/contexto/documento";
import { COLUMNA_DEL_DESTINO } from "@/lib/sessions/destinos-de-contexto";

/**
 * POST /api/projects/[projectId]/contexto/[pieza]/sessions — «Contexto» de un DOCUMENTO (2026-09-28).
 *
 * Hoy solo `diagnosis`. El diagnóstico arranca SUGERIDO (toda reunión con el cliente alimenta), así
 * que esta ruta escribe el afinado del CSE sobre esa sugerencia:
 *   { sessionId, feeds: true }  → «Agregar»: entra aunque no sea con el cliente, o aunque todavía no
 *                                 sea del proyecto (se vincula con source=manual, por la misma puerta
 *                                 que el handoff y el cronograma: rechazo cross-cliente y adopción).
 *   { sessionId, feeds: false } → la X: sale del diagnóstico. NO la desvincula del proyecto ni la saca
 *                                 del handoff, del cronograma, de la Entrega ni de las minutas.
 *
 * `false` y no `null` en la X, al revés que el cronograma: acá `null` es «sugerida», o sea que volver
 * a null la devolvería al documento. Tampoco lockea el vínculo (session-project-locks.ts).
 *
 * Guard: la celda de GENERAR el documento. Curar no llama a la IA.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; pieza: string }> },
) {
  const { projectId, pieza } = await params;
  const doc = documentoConContexto(pieza);
  if (!doc) return NextResponse.json({ error: "Este documento no tiene contexto propio." }, { status: 404 });
  const guard = await guardContextoDelDocumento(projectId, doc.seccion);
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

  const prep = await prepararVinculoManual({
    sessionId,
    projectId,
    clientId: guard.clientId,
    quiereIncluir: body.feeds,
    actorEmail: guard.teamMember.email ?? null,
  });
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

  // La columna de ESTE documento (diagnosisOverride, planningOverride, implementationOverride).
  const columna = COLUMNA_DEL_DESTINO[doc.destino];

  if (!body.feeds) {
    // `updateMany` por si el clasificador borró el vínculo entre medio: sacar lo que ya no está no es error.
    await prisma.sessionProject.updateMany({
      where: { sessionId, projectId },
      data: { [columna]: false },
    });
    return NextResponse.json({ ok: true });
  }

  await prisma.sessionProject.upsert({
    where: { sessionId_projectId: { sessionId, projectId } },
    create: { sessionId, projectId, source: "manual", [columna]: true },
    /* Solo el afinado de ESTE documento: los demás no se tocan. Agregarla resucita un tombstone
       (`included=false`) — sin eso quedaría agregada y sin alimentar nada. */
    update: { [columna]: true, included: true },
  });
  return NextResponse.json({ ok: true });
}
