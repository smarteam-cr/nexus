/**
 * lib/auth/permissions/artifact-gate.ts — SERVER-ONLY.
 *
 * Mapea un AGENTE de IA a la celda de permiso que exige su corrida (PERM-F5):
 * los agentes que ESCRIBEN un artefacto (handoff / kickoff / procesos /
 * cronograma) piden `generate` si el artefacto NO existe aún, `regenerate` si
 * ya existe. Devuelve null para agentes que no escriben artefactos — análisis
 * interno (diagnóstico, preparación de entrevistas/kickoff), watchdog, marketing,
 * cobranza y el de AVANCE del cronograma (solo PROPONE, el CSE confirma) — que
 * mantienen su acceso normal (withClientAccess / sus propios guards).
 *
 * Señales de "ya existe" (las mismas del resto del sistema):
 *   - handoff:    Project.handoffGeneratedAt (sello del ciclo de vida)
 *   - kickoff:    canvas "Kickoff" del proyecto con bloques (≈ deriveSetup)
 *   - procesos:   flowcharts con nodos en la sección procesos del cliente (≈ deriveSetup)
 *   - cronograma: tareas source AGENT|MODIFIED (= hasAiDetail, el predicado del
 *     gate v1 de timeline/assist) — para el agente de detalle Y planificación
 *     (que escribe el esqueleto).
 * Sin projectId (corridas legacy a nivel cliente) no hay señal → "generate".
 */
import { prisma } from "@/lib/db/prisma";
import { SENTINEL_SERVICE_TYPE } from "@/lib/canvas/strategy-project";

export type ArtifactGate = {
  section: "handoff" | "kickoff" | "procesos" | "cronograma";
  action: "generate" | "regenerate";
};

async function hasAiTimelineDetail(projectId: string | null): Promise<boolean> {
  if (!projectId) return false;
  const n = await prisma.timelineTask.count({
    where: { phase: { timeline: { projectId } }, source: { in: ["AGENT", "MODIFIED"] } },
  });
  return n > 0;
}

export async function resolveArtifactGate(
  agent: { id: string; agentGroup: string | null },
  clientId: string,
  projectId: string | null,
): Promise<ArtifactGate | null> {
  switch (agent.agentGroup) {
    case "handoff": {
      if (!projectId) return { section: "handoff", action: "generate" };
      const p = await prisma.project.findUnique({
        where: { id: projectId },
        select: { handoffGeneratedAt: true },
      });
      // "Ya existe" = sello del ciclo de vida O bloques AGENT en el canvas Handoff.
      // El sello es el criterio primario, pero un handoff generado por código VIEJO
      // (pre-lifecycle) o en una DB restaurada puede tener bloques sin sello → sin el
      // fallback por bloques, ese handoff se clasificaría "generate" y una corrida lo
      // PISARÍA (deleteMany de bloques AGENT), justo lo que la celda regenerate custodia.
      let exists = !!p?.handoffGeneratedAt;
      if (!exists) {
        const aiBlocks = await prisma.canvasBlock.count({
          where: { source: "AGENT", section: { canvas: { projectId, name: "Handoff" } } },
        });
        exists = aiBlocks > 0;
      }
      return { section: "handoff", action: exists ? "regenerate" : "generate" };
    }
    case "kickoff": {
      if (!projectId) return { section: "kickoff", action: "generate" };
      // Solo bloques GENERADOS por IA (source AGENT). Las secciones curadas
      // (equipo/horarios/canales/cierre) se siembran como CARD source=HUMAN al crear
      // el proyecto (createDefaultCanvases) → contarlas daría "regenerate" siempre y
      // dejaría kickoff.generate como letra muerta. Espeja el criterio de cronograma.
      const aiBlocks = await prisma.canvasBlock.count({
        where: { source: "AGENT", section: { canvas: { projectId, name: "Kickoff" } } },
      });
      return { section: "kickoff", action: aiBlocks > 0 ? "regenerate" : "generate" };
    }
    // Planificación escribe el ESQUELETO del cronograma (persistTimelineFromAgentOutput).
    case "planificacion":
      return {
        section: "cronograma",
        action: (await hasAiTimelineDetail(projectId)) ? "regenerate" : "generate",
      };
    case "cronograma": {
      // agent-timeline-detail ESCRIBE tareas; agent-timeline-progress solo propone → sin gate.
      if (agent.id !== "agent-timeline-detail") return null;
      return {
        section: "cronograma",
        action: (await hasAiTimelineDetail(projectId)) ? "regenerate" : "generate",
      };
    }
    default: {
      // Mapeo de procesos vive en el grupo legacy "preparacion" — se identifica por ID
      // (es el único de su grupo que escribe un artefacto: los flujos del cliente).
      if (agent.id === "agent-mapeo-inicial") {
        const flowBlocks = await prisma.canvasBlock.findMany({
          where: {
            blockType: "FLOWCHART",
            section: {
              key: "procesos",
              canvas: {
                name: "Información del cliente",
                project: { clientId, serviceType: SENTINEL_SERVICE_TYPE },
              },
            },
          },
          select: { data: true },
        });
        const has = flowBlocks.some((b) => {
          const nodes = (b.data as { nodes?: unknown[] } | null)?.nodes;
          return Array.isArray(nodes) && nodes.length > 0;
        });
        return { section: "procesos", action: has ? "regenerate" : "generate" };
      }
      return null;
    }
  }
}

/** Copy del 403 (interno, voseo). */
export function artifactGateMessage(gate: ArtifactGate): string {
  const label = {
    handoff: "el handoff",
    kickoff: "el kickoff",
    procesos: "los procesos",
    cronograma: "el cronograma",
  }[gate.section];
  return gate.action === "regenerate"
    ? `Tu rol no puede regenerar ${label} con IA (ya está generado). Pedile a un CSL o Super Admin, o ajustalo a mano.`
    : `Tu rol no puede generar ${label} con IA.`;
}
