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
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveActiveAccess, touchAccess } from "./access";
import { readPublishedClientTimeline } from "./timeline-view";
import { readClientProcesos } from "@/lib/canvas/read-procesos";
import type { KickoffLandingData } from "./kickoff-view-types";
import { getBrandLogos, platformLogosFor } from "./smarteam-logo";

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

  // #3 — claves OCULTAS del kickoff (id de sección, "procesos", "cronograma", o id de
  // un proceso individual). El cliente NO ve nada cuya clave esté en este set.
  const proj = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true, hiddenKickoffKeys: true, tags: true },
  });
  const hidden = new Set(proj?.hiddenKickoffKeys ?? []);

  // 3. Canvas Kickoff del proyecto (se identifica por nombre, igual que el panel interno).
  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId, name: "Kickoff" },
    select: { id: true, publishedSnapshot: true },
  });
  if (!canvas) return null;

  // 4. STAGING (D.3): el cliente ve SOLO el SNAPSHOT congelado al último "Subir"
  //    (secciones + bloques CONFIRMED + procesos confirmados). Editar/guardar NO lo
  //    toca → el cliente ve los cambios recién al re-subir. El filtro hidden se aplica
  //    abajo, sobre el snapshot.
  const liveSections = () =>
    prisma.canvasSection.findMany({
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
  type SectionRow = Awaited<ReturnType<typeof liveSections>>[number];
  type ProcesoRow = Awaited<ReturnType<typeof readClientProcesos>>[number];

  let snap = canvas.publishedSnapshot as unknown as
    | { sections?: SectionRow[]; procesos?: ProcesoRow[] }
    | null;

  // Backfill perezoso (auto-migración): kickoff publicado antes de la feature →
  // congelar el vivo actual (= lo que el cliente ya veía) y devolverlo. Sin esto el
  // cliente vería vacío; con esto, dejan de filtrarse las ediciones. Best-effort.
  if (!snap) {
    const [liveSecs, liveProcs] = await Promise.all([
      liveSections(),
      proj ? readClientProcesos(proj.clientId, { onlyConfirmed: true }) : Promise.resolve([] as ProcesoRow[]),
    ]);
    snap = { sections: liveSecs, procesos: liveProcs };
    try {
      await prisma.projectCanvas.update({
        where: { id: canvas.id },
        data: {
          publishedSnapshot: snap as unknown as Prisma.InputJsonValue,
          publishedSnapshotAt: new Date(),
        },
      });
    } catch (e) {
      console.error("[kickoff-view] backfill de snapshot falló:", e instanceof Error ? e.message : e);
    }
  }
  const sections: SectionRow[] = snap.sections ?? [];
  const procesosAll: ProcesoRow[] = snap.procesos ?? [];

  // 5. Cronograma embebido — regla unificada D.1.5: SOLO si timelinePublishedAt != null.
  //    Sale del SNAPSHOT del timeline (fuente única, mismo staging). "cronograma" en
  //    hiddenKickoffKeys lo oculta solo del kickoff (la página standalone se rige por su flag).
  const timeline = access.project.timelinePublishedAt && !hidden.has("cronograma")
    ? await readPublishedClientTimeline(projectId)
    : { exists: false as const, anchorStartDate: null, phases: [] };

  // 6. Procesos — del SNAPSHOT (no en vivo). #3 — "procesos" oculto saca toda la
  //    sección; además se filtran los procesos individuales cuyo id esté oculto.
  const procesos =
    proj && !hidden.has("procesos")
      ? procesosAll.filter((p) => !hidden.has(p.id))
      : [];

  // 7. Marcar uso (no bloquea el render si falla).
  await touchAccess(access.accessId);

  return {
    projectName: access.project.name,
    clientLogoUrl: access.project.client.logoUrl,
    platformLogos: platformLogosFor(proj?.tags ?? [], await getBrandLogos()),
    procesos,
    sections: sections.filter((s) => !hidden.has(s.id)).map((s) => ({
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
