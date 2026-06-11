/**
 * lib/external/kickoff-view.ts
 *
 * CHOKEPOINT de seguridad de la superficie externa (Fase C.1). Es el ÚNICO
 * lugar donde un token de cliente se resuelve a datos. Corre SIEMPRE server-side
 * (lo invoca la ruta pública app/external/kickoff/page.tsx en cada render).
 *
 * Modelo de seguridad (las 3 decisiones de Fase C viven acá):
 *   1. El scoping al proyecto NO lo da RLS (Prisma bypassa) — lo da, al 100%,
 *      el filtro token→projectId de esta función. No hay endpoint de datos
 *      público: el read pasa por acá.
 *   2. Doble check OBLIGATORIO EN CADA LECTURA: acceso no revocado
 *      (revokedAt == null) Y Kickoff publicado (kickoffPublishedAt != null).
 *      Si cualquiera falla → null (denegado). Por eso la cookie de 30 días NO
 *      otorga acceso por sí sola: revocar o despublicar corta el acceso en el
 *      render siguiente aunque la cookie siga viva.
 *   3. Shape LIMPIO: se devuelven solo bloques CONFIRMED, mapeados a
 *      { id, blockType, content, data } — sin source/status/agentRunId.
 */
import { prisma } from "@/lib/db/prisma";
import type { KickoffLandingData } from "./kickoff-view-types";

/** Nombre de la cookie httpOnly que transporta el token (lo setea verify-access). */
export const EXTERNAL_ACCESS_COOKIE = "nexus_ext_access";

const TOKEN_RE = /^[a-f0-9]{64}$/i;

/**
 * Resuelve un token de acceso externo al Kickoff publicado de SU proyecto.
 * Devuelve el shape limpio listo para render, o `null` si el acceso no aplica
 * (token inválido/inexistente, revocado, o Kickoff no publicado). Nunca lanza
 * por "denegado" — un null = no mostrar nada.
 */
export async function getPublishedKickoffForToken(
  token: string,
): Promise<KickoffLandingData | null> {
  // 0. Forma del token (evita tocar DB con basura).
  if (!token || !TOKEN_RE.test(token)) return null;

  // 1. token → acceso → proyecto (incluye el flag de publicación).
  const access = await prisma.projectExternalAccess.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      revokedAt: true,
      project: { select: { id: true, name: true, kickoffPublishedAt: true } },
    },
  });
  if (!access) return null;

  // 2. DOBLE CHECK de seguridad (ambos obligatorios, en CADA lectura).
  if (access.revokedAt) return null; // acceso revocado → gana sobre la cookie
  if (!access.project.kickoffPublishedAt) return null; // no publicado → gana sobre la cookie

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
      order: true,
      blocks: {
        where: { status: "CONFIRMED" },
        orderBy: { order: "asc" },
        select: { id: true, blockType: true, content: true, data: true },
      },
    },
  });

  // 5. Cronograma (read-only; las fechas reales se calculan en el cliente desde anchorStartDate).
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      id: true,
      anchorStartDate: true,
      detailConfirmedAt: true,
      phases: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          order: true,
          durationWeeks: true,
          sessionCount: true,
          notes: true,
        },
      },
    },
  });

  // 5b. D.1 — acciones por semana, SOLO si el CSE confirmó el detalle.
  // Gate server-side: sin confirmación las tareas ni se consultan — jamás
  // llegan al JSON del browser. El select es explícito: título + semana,
  // NUNCA status/notes/source/needsValidation (internos).
  let tasksByPhase: Map<string, Array<{ title: string; weekIndex: number }>> | null = null;
  if (tl?.detailConfirmedAt) {
    const tasks = await prisma.timelineTask.findMany({
      where: { phase: { timelineId: tl.id } },
      orderBy: [{ weekIndex: "asc" }, { order: "asc" }],
      select: { phaseId: true, title: true, weekIndex: true },
    });
    tasksByPhase = new Map();
    for (const t of tasks) {
      const arr = tasksByPhase.get(t.phaseId) ?? [];
      arr.push({ title: t.title, weekIndex: t.weekIndex });
      tasksByPhase.set(t.phaseId, arr);
    }
  }

  // 6. Marcar uso (no bloquea el render si falla).
  await prisma.projectExternalAccess
    .update({ where: { id: access.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    projectName: access.project.name,
    sections: sections.map((s) => ({
      id: s.id,
      key: s.key,
      label: s.label,
      order: s.order,
      blocks: s.blocks.map((b) => ({
        id: b.id,
        blockType: b.blockType,
        content: b.content,
        data: b.data,
      })),
    })),
    timeline: {
      exists: !!tl,
      anchorStartDate: tl?.anchorStartDate?.toISOString() ?? null,
      phases: (tl?.phases ?? []).map((p) => ({
        ...p,
        ...(tasksByPhase ? { tasks: tasksByPhase.get(p.id) ?? [] } : {}),
      })),
    },
  };
}
