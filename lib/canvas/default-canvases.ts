import { prisma } from "@/lib/db/prisma";

type CanvasDefinition = {
  name: string;
  isDefault: boolean;
  sections: Array<{ key: string; label: string }>;
};

export const DEFAULT_PROJECT_CANVASES: CanvasDefinition[] = [
  {
    name: "Resumen",
    isDefault: true,
    sections: [], // Usa DEFAULT_SECTIONS hardcoded en canvas-cards API
  },
  {
    name: "Diagnóstico",
    isDefault: false,
    sections: [
      { key: "contexto_alcance", label: "Contexto y alcance" },
      { key: "estado_actual", label: "Estado actual (Current State)" },
      { key: "estado_deseado", label: "Estado deseado (Desired State)" },
      { key: "gap_analysis", label: "Gap Analysis" },
      { key: "causa_raiz", label: "Análisis de Causa Raíz" },
      { key: "impacto_gap", label: "Impacto del Gap" },
      { key: "recomendaciones", label: "Recomendaciones priorizadas" },
      { key: "proximos_pasos", label: "Próximos pasos / Caso de Uso propuesto" },
    ],
  },
  {
    name: "Planificación",
    isDefault: false,
    sections: [
      { key: "arquitectura_solucion", label: "Arquitectura de la solución" },
      { key: "roadmap", label: "Roadmap de implementación" },
      { key: "definicion_procesos", label: "Definición de procesos" },
      { key: "metricas_exito", label: "Métricas de éxito" },
    ],
  },
  {
    name: "Ejecución",
    isDefault: false,
    sections: [
      { key: "configuracion", label: "Configuración y setup" },
      { key: "desarrollo", label: "Desarrollo y personalización" },
      { key: "integraciones", label: "Integraciones" },
      { key: "qa_testing", label: "QA y testing" },
    ],
  },
  {
    name: "Adopción",
    isDefault: false,
    sections: [
      { key: "capacitacion", label: "Capacitación" },
      { key: "piloto", label: "Piloto y feedback" },
      { key: "escalamiento", label: "Escalamiento" },
      { key: "mejora_continua", label: "Mejora continua" },
    ],
  },
  {
    // Fase 2 del módulo externo: handoff Sales→CS. Cada sección 1:1 con una
    // card del agente "Handoff Sales→CS" (matching exacto por canvasSection).
    // Se aplica retroactivamente a proyectos existentes con
    // scripts/migrate-add-handoff-canvas.ts.
    name: "Handoff",
    isDefault: false,
    sections: [
      { key: "acuerdos_promesas",    label: "Acuerdos clave y promesas especiales" },
      { key: "alcance_contratado",   label: "¿Qué vendimos?" },
      { key: "motivacion_decision",  label: "¿Por qué vendimos? (por qué nos eligieron)" },
      { key: "dolor_principal",      label: "Dolor principal" },
      { key: "expectativas",         label: "Expectativas del cliente" },
      { key: "stakeholders_handoff", label: "Stakeholders clave" },
      { key: "estado_en_flight",     label: "Proyectos y avances en curso" },
      { key: "riesgos_banderas",     label: "Riesgos y banderas rojas" },
    ],
  },
  {
    // Kickoff (Fase A): landing de arranque DE CARA AL CLIENTE, generada por el
    // agente "agent-kickoff-canvas" a partir del Handoff curado (bloques CONFIRMED)
    // + el cronograma. Subconjunto curado y con tono distinto al Handoff: NO
    // incluye secciones internas (riesgos, "por qué vendimos", acuerdos de CS).
    // El cronograma NO es una sección — la plantilla lo pinta desde ProjectTimeline.
    // Se aplica retroactivamente con scripts/migrate-add-kickoff-canvas.ts.
    name: "Kickoff",
    isDefault: false,
    sections: [
      { key: "bienvenida",     label: "Bienvenida y contexto" },
      { key: "objetivos",      label: "Objetivos del proyecto" },
      { key: "alcance",        label: "Alcance: qué incluye" },
      { key: "tu_rol",         label: "Lo que necesitamos de tu equipo" },
      { key: "metricas_exito", label: "Cómo mediremos el éxito" },
      { key: "proximos_pasos", label: "Próximos pasos" },
    ],
  },
];

/** Map from agentGroup to canvas name for routing cards/blocks.
 *  Fuente ÚNICA — app/api/clients/[id]/analyze/route.ts la importa de acá
 *  (antes estaba duplicada; centralizada en Kickoff Fase A). */
export const AGENT_GROUP_TO_CANVAS: Record<string, string> = {
  diagnostico: "Diagnóstico",
  planificacion: "Planificación",
  ejecucion: "Ejecución",
  adopcion: "Adopción",
  handoff: "Handoff",
  kickoff: "Kickoff",
};

/** Create all standard canvases for a project with CanvasSection records. */
export async function createDefaultCanvases(projectId: string) {
  // Create all canvases
  await prisma.projectCanvas.createMany({
    data: DEFAULT_PROJECT_CANVASES.map((c) => ({
      projectId,
      name: c.name,
      isDefault: c.isDefault,
      sections: c.sections, // Keep JSON for backward compat
    })),
  });

  // Create CanvasSection records for non-default canvases
  const createdCanvases = await prisma.projectCanvas.findMany({
    where: { projectId, isDefault: false },
    select: { id: true, name: true },
  });

  for (const canvas of createdCanvases) {
    const def = DEFAULT_PROJECT_CANVASES.find((d) => d.name === canvas.name);
    if (!def?.sections.length) continue;
    await prisma.canvasSection.createMany({
      data: def.sections.map((s, i) => ({
        canvasId: canvas.id,
        key: s.key,
        label: s.label,
        order: i,
      })),
    });
  }
}
