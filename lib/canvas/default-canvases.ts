import { prisma } from "@/lib/db/prisma";

type CanvasDefinition = {
  name: string;
  isDefault: boolean;
  sections: Array<{ key: string; label: string }>;
};

export const DEFAULT_PROJECT_CANVASES: CanvasDefinition[] = [
  {
    name: "Resumen del servicio",
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
];

/** Map from agentGroup to canvas name for routing cards */
export const AGENT_GROUP_TO_CANVAS: Record<string, string> = {
  diagnostico: "Diagnóstico",
  planificacion: "Planificación",
  ejecucion: "Ejecución",
  adopcion: "Adopción",
};

/** Create all standard canvases for a project. Call after project creation. */
export async function createDefaultCanvases(projectId: string) {
  await prisma.projectCanvas.createMany({
    data: DEFAULT_PROJECT_CANVASES.map((c) => ({
      projectId,
      name: c.name,
      isDefault: c.isDefault,
      sections: c.sections,
    })),
  });
}
