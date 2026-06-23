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

// Pasos de setup basados en CANVAS (identificados por nombre). Extensible: sumar el canvas de
// diagnóstico/planificación a futuro = una línea acá + su pill en la UI. `requireConfirmed`
// controla si un bloque DRAFT cuenta como "generado" (handoff/kickoff cuentan por existencia).
export const SETUP_CANVAS_STEPS = [
  { key: "handoff", canvasName: "Handoff", requireConfirmed: false },
  { key: "kickoff", canvasName: "Kickoff", requireConfirmed: true },
] as const;
export const SETUP_CANVAS_NAMES: string[] = SETUP_CANVAS_STEPS.map((s) => s.canvasName);
export const CONFIRMED_ONLY = new Set<string>(
  SETUP_CANVAS_STEPS.filter((s) => s.requireConfirmed).map((s) => s.canvasName),
);

export interface SetupSignals {
  handoff: boolean;
  kickoff: boolean;
  cronograma: "sin" | "borrador" | "publicado";
  procesos: boolean;
}

/** ¿Este bloque cuenta para su paso? (aplica la regla requireConfirmed por canvas). */
export function blockCountsForStep(canvasName: string, status: string): boolean {
  return !(CONFIRMED_ONLY.has(canvasName) && status !== "CONFIRMED");
}

/**
 * Derivación PURA de las señales de setup a partir de datos ya cargados.
 * `steps` = nombres de canvas presentes (ya filtrados por blockCountsForStep).
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
    handoff: input.steps.has("Handoff"),
    kickoff: input.steps.has("Kickoff"),
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
      where: { section: { canvas: { projectId, name: { in: SETUP_CANVAS_NAMES } } } },
      select: { status: true, section: { select: { canvas: { select: { name: true } } } } },
    }),
    prisma.projectTimeline.findUnique({
      where: { projectId },
      select: {
        baselines: { where: { isActive: true }, take: 1, select: { id: true } },
        phases: { take: 1, select: { id: true } },
      },
    }),
    prisma.canvasBlock.findMany({
      where: {
        blockType: "FLOWCHART",
        status: "CONFIRMED",
        section: {
          key: "procesos",
          canvas: { name: "Información del cliente", project: { clientId, serviceType: SENTINEL_SERVICE_TYPE } },
        },
      },
      select: { data: true },
    }),
  ]);

  const steps = new Set<string>();
  for (const b of setupBlocks) {
    const name = b.section.canvas.name;
    if (blockCountsForStep(name, b.status)) steps.add(name);
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
