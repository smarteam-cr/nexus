import { NextRequest, NextResponse } from "next/server";
import { guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { leerCuerpoDeVinculos, prepararVinculosManuales } from "@/lib/sessions/agregar-sesion";
import { documentoConContexto } from "@/lib/contexto/documento";
import { COLUMNA_DEL_DESTINO, esSoloElegidas, valorDelAfinado } from "@/lib/sessions/destinos-de-contexto";

/**
 * POST /api/projects/[projectId]/contexto/[pieza]/sessions — «Contexto» de un DOCUMENTO (2026-09-28).
 *
 * Los documentos de lib/contexto/documento.ts (diagnóstico, planificación, ejecución y, desde el
 * 2026-10-07, kickoff, exploración, integraciones y entrega). Qué escribe en la columna del documento
 * lo decide `valorDelAfinado` (lib/sessions/destinos-de-contexto.ts), puro y con test.
 *
 * ── LOS SEIS QUE LEEN SOLO LAS ELEGIDAS (etapa 7) ────────────────────────────
 * Diagnóstico, planificación, ejecución, kickoff, integraciones y entrega (DECISIONS «Los documentos
 * leen la memoria y solo las reuniones elegidas»). Se comportan como el cronograma:
 *   { sessionId, feeds: true }  → «Usar» o «Agregar»: `true`, la elige una persona. Puede no ser del
 *                                 proyecto todavía: se vincula (source=manual), por la misma puerta
 *                                 que el handoff y el cronograma (rechazo cross-cliente y adopción).
 *                                 Si ya era del proyecto, solo cambia el afinado; una elegida de antes del
 *                                 piso del proyecto se lee igual (el lector la exime del piso en ese
 *                                 documento). Deshacer una X también: devolver es elegir (`sugeridas` se ignora).
 *   { sessionId, feeds: false } → la X sobre una elegida: `null`, deja de elegirla. NO la desvincula
 *                                 del proyecto ni la saca de los otros documentos.
 *   { sessionId, feeds: false, desestimar: true } → «Descartar» una reunión que Nexus sugirió: `false`
 *                                 (desestimada). No pone candado (session-project-locks.ts).
 *   Nada de esta ruta escribe `true` sin un pedido: `true` es el candado humano.
 *
 * ── LA EXPLORACIÓN (la regla sugerida de antes, hasta salir del módulo) ──────
 *   feeds: true → `true` (agregada); deshacer la X de una sugerida → `null` (vuelve a «sugerida»);
 *   feeds: false → `false` (la X; acá `null` es «sugerida»).
 *
 * { sessionIds: [...], feeds } → lo mismo para varias, en UNA transacción (2026-10-09: «Quitar las N»
 * y deshacer). Si una no pasa las validaciones, no se escribe ninguna y el error dice cuál.
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
  const { ids, feeds, sugeridas, desestimar } = cuerpo;
  if (desestimar && !esSoloElegidas(doc.destino)) {
    return NextResponse.json({ error: "Este documento no tiene reuniones sugeridas que descartar." }, { status: 400 });
  }

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
  const valor = (sessionId: string) => valorDelAfinado(doc.destino, { feeds, desestimar, sugerida: sugeridas.has(sessionId) });

  if (!feeds) {
    /* La X (`null` en los seis, `false` en la exploración) o «Descartar» (`false`). `updateMany` por si
       el clasificador borró el vínculo entre medio: sacar lo que ya no está no es error. */
    await prisma.$transaction(
      ids.map((sessionId) =>
        prisma.sessionProject.updateMany({
          where: { sessionId, projectId },
          data: { [columna]: valor(sessionId) },
        }),
      ),
    );
    return NextResponse.json({ ok: true });
  }

  await prisma.$transaction(
    ids.map((sessionId) =>
      /* Solo en la exploración: deshacer la X de una sugerida (reunión con el cliente que nadie tocó)
         vuelve el afinado vacío, como estaba, y no «agregada a mano». */
      valor(sessionId) === null
        ? prisma.sessionProject.updateMany({
            where: { sessionId, projectId },
            data: { [columna]: null, included: true },
          })
        : prisma.sessionProject.upsert({
            where: { sessionId_projectId: { sessionId, projectId } },
            create: { sessionId, projectId, source: "manual", [columna]: true },
            /* Solo el afinado de ESTE documento: los demás no se tocan (tampoco `source`: la X después tiene que
               poder soltar el candado). Elegirla resucita un tombstone (`included=false`) — sin eso quedaría
               elegida y sin alimentar nada. Una elegida de antes del piso del proyecto se lee igual: el lector
               la exime del piso en ESTE documento (`getProjectDocumentSessions`). */
            update: { [columna]: true, included: true },
          })
    ),
  );
  return NextResponse.json({ ok: true });
}
