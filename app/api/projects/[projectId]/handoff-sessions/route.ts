import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { vetoSiElHandoffEsDeOtro } from "@/lib/handoff/duenio";
import { prisma } from "@/lib/db/prisma";
import { leerCuerpoDeVinculos, prepararVinculosManuales } from "@/lib/sessions/agregar-sesion";

/**
 * POST /api/projects/[projectId]/handoff-sessions
 *
 * Override del humano sobre qué sesiones alimentan el handoff (A2 rediseñado):
 *   { sessionId, feeds: true }  → forzar INCLUIR (botón "Agregar" del pop-up). Linkea la
 *                                 sesión al proyecto si no lo estaba (source=manual).
 *   { sessionId, feeds: false } → forzar EXCLUIR (la "X" del panel). NO desvincula la
 *                                 sesión del proyecto (cronograma/minutas intactos): solo
 *                                 deja de alimentar el handoff.
 *   { sessionIds: [...], feeds } → lo mismo para varias, en UNA transacción (2026-10-09: «Quitar
 *                                 las N» y deshacer de la lista de reuniones). Si una no pasa
 *                                 las validaciones, no se escribe ninguna.
 *
 * Gestionar el CONTEXTO del handoff (qué sesiones lo alimentan) = owner del cliente o
 * handoffAnywhere. El CSE cura el contexto de SUS proyectos (owner); editar el DOCUMENTO
 * del handoff sigue siendo handoffAnywhere. El scope de owner lo enfuerza requireHandoffAccess.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;
  // Qué sesiones alimentan el handoff se decide donde vive el handoff (lib/handoff/duenio.ts).
  const veto = await vetoSiElHandoffEsDeOtro(projectId);
  if (veto) return veto;

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

  /* La decisión —rechazo cross-cliente, adopción de huérfanas, relectura por carrera— vive en UN
     lugar desde el 2026-09-23 (lib/sessions/agregar-sesion.ts): la usan esta puerta y la del
     Contexto del cronograma, y cada una escribe SOLO su afinado. */
  /* La puerta única de agregar (prepararVinculoManual, en su versión en lote). Con varias, se validan TODAS antes de escribir: si una no pasa, no se escribe ninguna y el
     error dice cuál. */
  const prep = await prepararVinculosManuales({
    sessionIds: ids,
    projectId,
    clientId: guard.clientId,
    quiereIncluir: feeds,
    actorEmail: guard.teamMember.email ?? null,
  });
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

  await prisma.$transaction(
    ids.map((sessionId) =>
      /* Deshacer la X de una que alimentaba por regla (primaria o confianza alta): vuelve el afinado
         vacío, como estaba, y no «forzada a mano» (que le pondría candado al vínculo). */
      sugeridas.has(sessionId)
        ? prisma.sessionProject.updateMany({
            where: { sessionId, projectId },
            data: { handoffOverride: null, included: true },
          })
        : prisma.sessionProject.upsert({
            where: { sessionId_projectId: { sessionId, projectId } },
            create: { sessionId, projectId, source: "manual", handoffOverride: feeds },
            // Forzar INCLUIR al handoff resucita un tombstone (included=false): sin esto el
            // override quedaría en true pero la sesión seguiría sin alimentar nada (excluida
            // de la membresía) y el botón "Agregar" no tendría efecto visible.
            update: { handoffOverride: feeds, ...(feeds ? { included: true } : {}) },
          })
    ),
  );

  return NextResponse.json({ ok: true });
}
