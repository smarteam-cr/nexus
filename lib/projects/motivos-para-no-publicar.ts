import "server-only";

/**
 * lib/projects/motivos-para-no-publicar.ts — por qué una parte del proyecto TODAVÍA no se puede
 * publicar, dicho ANTES de tocar «Publicar» (pop-up de acceso, 2026-10-05).
 *
 * Hasta ese día el motivo llegaba solo como error después del clic: el CSE tocaba «Publicar» en la
 * Entrega y recién ahí se enteraba de que no tenía el documento. Ahora el panel deshabilita el botón
 * con el motivo a la vista.
 *
 * ⚠ ES UNA CORTESÍA, NO EL CANDADO. Las condiciones son las mismas que revisa cada endpoint
 * `publish-*` (publish-timeline, publish-entrega, lib/projects/publicar-documento.ts) y esos siguen
 * siendo los que deciden: si este archivo se queda atrás, el botón aparece habilitado y el endpoint
 * responde con su motivo, como antes. Si una condición cambia allá, cámbiala acá también.
 *
 * El kickoff y el requerimiento técnico no tienen condición propia: se publican siempre (además de
 * que el proyecto admita publicación, que es `motivoNoPublicable` del guard y va aparte).
 */
import { prisma } from "@/lib/db/prisma";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import type { PublishSurfaceKey } from "./publish-surfaces";

async function bloquesConfirmados(slug: string, projectId: string): Promise<number | null> {
  const canvas = await prisma.projectCanvas.findFirst({ where: canvasOfNested(slug, { projectId }), select: { id: true } });
  if (!canvas) return null;
  return prisma.canvasBlock.count({ where: { status: "CONFIRMED", section: { canvasId: canvas.id } } });
}

/** Un motivo por parte que no se puede publicar hoy; las que sí se pueden no aparecen. */
export async function motivosParaNoPublicar(projectId: string): Promise<Partial<Record<PublishSurfaceKey, string>>> {
  const [cronograma, entrega, planificacion, diagnostico] = await Promise.all([
    prisma.projectTimeline.findUnique({ where: { projectId }, select: { anchorStartDate: true, _count: { select: { phases: true } } } }),
    bloquesConfirmados("delivery", projectId),
    bloquesConfirmados("planning", projectId),
    prisma.projectCanvas.findFirst({ where: canvasOfNested("diagnosis", { projectId }), select: { id: true } }),
  ]);
  const motivos: Partial<Record<PublishSurfaceKey, string>> = {};

  if (!cronograma || cronograma._count.phases === 0) motivos.cronograma = "El cronograma todavía no tiene fases.";
  else if (!cronograma.anchorStartDate) motivos.cronograma = "Define la fecha de arranque del cronograma antes de publicarlo.";

  if (entrega === null) motivos.entrega = "Todavía no tiene el documento de Entrega.";
  else if (entrega === 0) motivos.entrega = "El documento de Entrega está vacío.";

  if (planificacion === null) motivos.planificacion = "Todavía no tiene la Planificación.";
  else if (planificacion === 0) motivos.planificacion = "La Planificación está vacía.";

  if (!diagnostico) motivos.diagnostico = "Todavía no tiene el Diagnóstico.";
  // La misma condición que `ultimaVersionPresentada` (lib/external/diagnostico-view.ts), contada
  // en vez de traída: esa función carga la foto entera y acá solo importa si existe.
  else if (
    (await prisma.hitoDeDocumento.count({
      where: { canvasId: diagnostico.id, tipo: { in: ["presentado", "aprobado"] }, fotoId: { not: null } },
    })) === 0
  ) {
    motivos.diagnostico = "Primero presenta el Diagnóstico: el cliente ve la versión presentada.";
  }

  return motivos;
}
