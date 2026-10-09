import { NextRequest, NextResponse } from "next/server";
import { guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { leerCuerpoDeVinculos, prepararVinculosManuales } from "@/lib/sessions/agregar-sesion";
import { documentoConContexto } from "@/lib/contexto/documento";
import { COLUMNA_DEL_DESTINO } from "@/lib/sessions/destinos-de-contexto";

/**
 * POST /api/projects/[projectId]/contexto/[pieza]/sessions — «Contexto» de un DOCUMENTO (2026-09-28).
 *
 * Los documentos de lib/contexto/documento.ts (diagnóstico, planificación, ejecución y, desde el
 * 2026-10-07, kickoff, exploración, integraciones y entrega). Todos arrancan SUGERIDOS (toda reunión
 * con el cliente alimenta), así que esta ruta escribe el afinado del CSE sobre esa sugerencia:
 *   { sessionId, feeds: true }  → «Agregar»: entra aunque no sea con el cliente, o aunque todavía no
 *                                 sea del proyecto (se vincula con source=manual, por la misma puerta
 *                                 que el handoff y el cronograma: rechazo cross-cliente y adopción).
 *   { sessionId, feeds: false } → la X: sale del diagnóstico. NO la desvincula del proyecto ni la saca
 *                                 del handoff, del cronograma, de la Entrega ni de las minutas.
 *   { sessionIds: [...], feeds } → lo mismo para varias, en UNA transacción (2026-10-09: «Quitar
 *                                 las N» y deshacer). Si una no pasa las validaciones, no se
 *                                 escribe ninguna y el error dice cuál.
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  // Una reunión ({ sessionId, feeds }) o varias ({ sessionIds, feeds }: «Quitar las N», deshacer).
  const cuerpo = leerCuerpoDeVinculos(raw);
  if (!cuerpo.ok) return NextResponse.json({ error: cuerpo.error }, { status: 400 });
  const { ids, feeds, sugeridas } = cuerpo;

  /* La puerta única de agregar, en su versión en lote. Con varias, se validan TODAS antes de escribir: si una no pasa, no se escribe ninguna y el
     error dice cuál. */
  const prep = await prepararVinculosManuales({
    sessionIds: ids,
    projectId,
    clientId: guard.clientId,
    quiereIncluir: feeds,
    actorEmail: guard.teamMember.email ?? null,
  });
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

  // La columna de ESTE documento (COLUMNA_DEL_DESTINO): cada uno guarda su afinado por separado.
  const columna = COLUMNA_DEL_DESTINO[doc.destino];

  if (!feeds) {
    // `updateMany` por si el clasificador borró el vínculo entre medio: sacar lo que ya no está no es error.
    await prisma.$transaction(
      ids.map((sessionId) =>
        prisma.sessionProject.updateMany({
          where: { sessionId, projectId },
          data: { [columna]: false },
        }),
      ),
    );
    return NextResponse.json({ ok: true });
  }

  await prisma.$transaction(
    ids.map((sessionId) =>
      /* Deshacer la X de una sugerida (reunión con el cliente que nadie tocó): vuelve el afinado vacío,
         como estaba, y no «agregada a mano». */
      sugeridas.has(sessionId)
        ? prisma.sessionProject.updateMany({
            where: { sessionId, projectId },
            data: { [columna]: null, included: true },
          })
        : prisma.sessionProject.upsert({
            where: { sessionId_projectId: { sessionId, projectId } },
            create: { sessionId, projectId, source: "manual", [columna]: true },
            /* Solo el afinado de ESTE documento: los demás no se tocan. Agregarla resucita un tombstone
               (`included=false`) — sin eso quedaría agregada y sin alimentar nada. */
            update: { [columna]: true, included: true },
          })
    ),
  );
  return NextResponse.json({ ok: true });
}
