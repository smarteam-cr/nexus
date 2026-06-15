/**
 * lib/external/kickoff-view.ts
 *
 * CHOKEPOINT de seguridad del KICKOFF externo (Fase C.1). Es el ÚNICO lugar
 * donde un token de cliente se resuelve a los datos del kickoff. Corre SIEMPRE
 * server-side (lo invoca la ruta pública app/external/kickoff/page.tsx en cada
 * render).
 *
 * Modelo de seguridad (las 3 decisiones de Fase C viven acá):
 *   1. El scoping al proyecto NO lo da RLS (Prisma bypassa) — lo da, al 100%,
 *      el filtro token→projectId (resolveActiveAccess, lib/external/access.ts).
 *      No hay endpoint de datos público: el read pasa por acá.
 *   2. Doble check OBLIGATORIO EN CADA LECTURA: acceso no revocado
 *      (revokedAt == null, en el resolver) Y Kickoff publicado
 *      (kickoffPublishedAt != null, acá). Si cualquiera falla → null (denegado).
 *      Por eso la cookie de 30 días NO otorga acceso por sí sola: revocar o
 *      despublicar corta el acceso en el render siguiente.
 *   3. Shape LIMPIO: se devuelven solo bloques CONFIRMED, mapeados a
 *      { id, blockType, content, data } — sin source/status/agentRunId.
 *
 * D.1.5 — regla UNIFICADA de publicación del cronograma: la sección de
 * cronograma embebida en el kickoff se gatea por SU propio flag
 * (timelinePublishedAt), no por el del kickoff. Kickoff publicado con
 * cronograma sin publicar → el landing sale SIN sección de cronograma (shape
 * vacío, idéntico a "no hay cronograma"). La lectura en sí (fases + tareas con
 * su filtro) vive en readClientTimeline — compartida con /external/cronograma
 * para que el filtro de seguridad exista en UN solo lugar.
 */
import { prisma } from "@/lib/db/prisma";
import { resolveActiveAccess, touchAccess } from "./access";
import { readClientTimeline } from "./timeline-view";
import type { KickoffLandingData } from "./kickoff-view-types";

/**
 * Resuelve un token de acceso externo al Kickoff publicado de SU proyecto.
 * Devuelve el shape limpio listo para render, o `null` si el acceso no aplica
 * (token inválido/inexistente, revocado, o Kickoff no publicado). Nunca lanza
 * por "denegado" — un null = no mostrar nada.
 */
export async function getPublishedKickoffForToken(
  token: string,
): Promise<KickoffLandingData | null> {
  // 1-2. token → acceso activo → proyecto (forma + existencia + revokedAt).
  const access = await resolveActiveAccess(token);
  if (!access) return null;

  // Check de superficie EXPLÍCITO: Kickoff publicado, en CADA lectura.
  if (!access.project.kickoffPublishedAt) return null;

  const projectId = access.project.id;

  // 3. Canvas Kickoff del proyecto (se identifica por nombre, igual que el panel interno).
  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId, name: "Kickoff" },
    select: { id: true },
  });
  if (!canvas) return null;

  // 4. Secciones + SOLO bloques CONFIRMED, en shape limpio (sin campos internos).
  const sections = await prisma.canvasSection.findMany({
    where: { canvasId: canvas.id },
    orderBy: { order: "asc" },
    select: {
      id: true,
      key: true,
      label: true,
      titleOverride: true,
      eyebrowOverride: true,
      order: true,
      blocks: {
        where: { status: "CONFIRMED" },
        orderBy: { order: "asc" },
        select: { id: true, blockType: true, content: true, data: true },
      },
    },
  });

  // 5. Cronograma — regla unificada D.1.5: SOLO si timelinePublishedAt != null.
  // Sin publicar → shape vacío (el landing renderiza como si no hubiera
  // cronograma). La lectura compartida aplica el filtro de seguridad (tareas
  // solo {title, weekIndex} y solo con detailConfirmedAt).
  const timeline = access.project.timelinePublishedAt
    ? await readClientTimeline(projectId)
    : { exists: false as const, anchorStartDate: null, phases: [] };

  // 6. Marcar uso (no bloquea el render si falla).
  await touchAccess(access.accessId);

  return {
    projectName: access.project.name,
    clientLogoUrl: access.project.client.logoUrl,
    sections: sections.map((s) => ({
      id: s.id,
      key: s.key,
      label: s.label,
      titleOverride: s.titleOverride,
      eyebrowOverride: s.eyebrowOverride,
      order: s.order,
      blocks: s.blocks.map((b) => ({
        id: b.id,
        blockType: b.blockType,
        content: b.content,
        data: b.data,
      })),
    })),
    timeline,
  };
}
