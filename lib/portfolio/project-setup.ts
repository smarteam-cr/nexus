/**
 * lib/portfolio/project-setup.ts
 *
 * Señales de SETUP de un proyecto: qué artefactos del onboarding se generaron
 * (handoff / kickoff / cronograma / procesos). Fuente ÚNICA, consumida por:
 *   - el panel de cartera (loadPortfolio, en batch sin N+1) vía `deriveSetup`,
 *   - la página del proyecto (ProjectGPS) vía `loadProjectSetup` (un proyecto).
 *
 * `deriveSetup` es PURA (recibe señales ya cargadas) → la comparte el batch del
 * panel. `loadProjectSetup` hace sus propias queries para UN proyecto (N+1
 * aceptable para una sola fila) y delega la derivación en `deriveSetup`.
 *
 * Importante (separación generado / EXPUESTO): este módulo mide "generado"
 * (los bloques existen). La exposición al cliente la gobierna el STAGING
 * (publishedSnapshot + flags de publish), no el estado del bloque.
 */
import { prisma } from "@/lib/db/prisma";
import { SENTINEL_SERVICE_TYPE } from "@/lib/canvas/strategy-project";
import { canvasOfNested, canvasOfAnyNested } from "@/lib/pieces/canvas-query";
import { slugForCanvas } from "@/lib/pieces/registry";

// Pasos de setup basados en CANVAS (identificados por SLUG de pieza). Extensible: sumar el canvas de
// diagnóstico/planificación a futuro = una línea acá + su pill en la UI. Cuentan por EXISTENCIA
// del bloque = "generado", NO "expuesto al cliente" (eso lo gobierna el staging). Con born-CONFIRMED
// (#1) el handoff/kickoff nacen CONFIRMED; contar por existencia además rescata kickoffs DRAFT viejos.
// `requireConfirmed` queda por si un paso futuro necesita exigir confirmación.
export const SETUP_CANVAS_STEPS = [
  { key: "handoff", canvasSlug: "handoff", requireConfirmed: false },
  { key: "kickoff", canvasSlug: "kickoff", requireConfirmed: false },
] as const;
export const SETUP_CANVAS_SLUGS: string[] = SETUP_CANVAS_STEPS.map((s) => s.canvasSlug);
export const CONFIRMED_ONLY = new Set<string>(
  SETUP_CANVAS_STEPS.filter((s) => s.requireConfirmed).map((s) => s.canvasSlug),
);

export interface SetupSignals {
  handoff: boolean;
  kickoff: boolean;
  cronograma: "sin" | "borrador" | "publicado";
  procesos: boolean;
}

/** ¿Este bloque cuenta para su paso? (aplica la regla requireConfirmed por pieza). */
export function blockCountsForStep(canvasSlug: string | null, status: string): boolean {
  return !(canvasSlug !== null && CONFIRMED_ONLY.has(canvasSlug) && status !== "CONFIRMED");
}

/**
 * Derivación PURA de las señales de setup a partir de datos ya cargados.
 * `steps` = slugs de pieza presentes (ya filtrados por blockCountsForStep).
 * Cronograma: "publicado" se ata al baseline ACTIVO (no al flag timelinePublishedAt,
 * que puede quedar seteado sin baseline por el fail-open del publish).
 */
export function deriveSetup(input: {
  steps: Set<string>;
  hasActiveBaseline: boolean;
  hasPhases: boolean;
  hasProcesos: boolean;
}): SetupSignals {
  return {
    handoff: input.steps.has("handoff"),
    kickoff: input.steps.has("kickoff"),
    cronograma: input.hasActiveBaseline ? "publicado" : input.hasPhases ? "borrador" : "sin",
    procesos: input.hasProcesos,
  };
}

/**
 * Señales de setup de UN proyecto (para la página del proyecto). Hace sus propias
 * queries (handoff/kickoff por projectId, cronograma por projectId, procesos por
 * clientId) y delega en `deriveSetup`. N+1 aceptable: es una sola fila, no el batch.
 */
export async function loadProjectSetup(projectId: string, clientId: string): Promise<SetupSignals> {
  const [setupBlocks, tl, procesoBlocks] = await Promise.all([
    prisma.canvasBlock.findMany({
      where: { section: { canvas: canvasOfAnyNested(SETUP_CANVAS_SLUGS, { projectId }) } },
      select: { status: true, section: { select: { canvas: { select: { slug: true, name: true } } } } },
    }),
    prisma.projectTimeline.findUnique({
      where: { projectId },
      select: {
        baselines: { where: { isActive: true }, take: 1, select: { id: true } },
        phases: { take: 1, select: { id: true } },
      },
    }),
    // Procesos por EXISTENCIA (no exige CONFIRMED): el panel mide "generado", no "expuesto" — la
    // exposición externa sí filtra CONFIRMED (read-procesos / kickoff-view).
    prisma.canvasBlock.findMany({
      where: {
        blockType: "FLOWCHART",
        section: {
          key: "procesos",
          canvas: canvasOfNested("client-info", { project: { clientId, serviceType: SENTINEL_SERVICE_TYPE } }),
        },
      },
      select: { data: true },
    }),
  ]);

  const steps = new Set<string>();
  for (const b of setupBlocks) {
    const slug = slugForCanvas(b.section.canvas);
    if (slug && blockCountsForStep(slug, b.status)) steps.add(slug);
  }

  const hasProcesos = procesoBlocks.some((b) => {
    const nodes = (b.data as { nodes?: unknown[] } | null)?.nodes;
    return Array.isArray(nodes) && nodes.length > 0;
  });

  return deriveSetup({
    steps,
    hasActiveBaseline: (tl?.baselines?.length ?? 0) > 0,
    hasPhases: (tl?.phases?.length ?? 0) > 0,
    hasProcesos,
  });
}
