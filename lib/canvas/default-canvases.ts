import { prisma } from "@/lib/db/prisma";

type CanvasDefinition = {
  name: string;
  isDefault: boolean;
  order: number;
  sections: Array<{ key: string; label: string }>;
};

// Orden = flujo real del onboarding: Handoff → Kickoff → Diagnóstico →
// Planificación → Cronograma. El array ES la fuente del `order`. El ancla/default
// (isDefault → fallback cuando no hay canvas elegido + no borrable desde la UI) es
// KICKOFF, no Handoff: Handoff migrará a nivel cliente, así que Kickoff es estable.
export const DEFAULT_PROJECT_CANVASES: CanvasDefinition[] = [
  {
    // Handoff (Fase 2 del módulo externo): traspaso Sales→CS. Primero en el
    // dropdown (order 0) pero NO es el ancla (Handoff migrará a nivel cliente).
    // Cada sección 1:1 con una card del agente "Handoff Sales→CS".
    // Se aplica retroactivamente con scripts/migrate-add-handoff-canvas.ts.
    name: "Handoff",
    isDefault: false,
    order: 0,
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
    // Kickoff (Fase A): landing de arranque DE CARA AL CLIENTE. El cronograma NO
    // es una sección — la plantilla lo pinta desde ProjectTimeline. ANCLA/default
    // del proyecto (isDefault → fallback cuando no hay canvas seleccionado + no
    // borrable desde la UI). Handoff dejará de ser canvas de proyecto pronto.
    name: "Kickoff",
    isDefault: true,
    order: 1,
    sections: [
      { key: "bienvenida",     label: "Bienvenida y contexto" },
      { key: "objetivos",      label: "Objetivos del proyecto" },
      { key: "alcance",        label: "Alcance: qué incluye" },
      { key: "tu_rol",         label: "Lo que necesitamos de tu equipo" },
      { key: "metricas_exito", label: "Cómo mediremos el éxito" },
      { key: "proximos_pasos", label: "Próximos pasos" },
    ],
  },
  {
    name: "Diagnóstico",
    isDefault: false,
    order: 2,
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
    order: 3,
    sections: [
      { key: "arquitectura_solucion", label: "Arquitectura de la solución" },
      { key: "roadmap", label: "Roadmap de implementación" },
      { key: "definicion_procesos", label: "Definición de procesos" },
      { key: "metricas_exito", label: "Métricas de éxito" },
    ],
  },
  {
    // Cronograma: editor del ProjectTimeline (fases/semanas/sesiones). NO tiene
    // CanvasSection — lo respalda ProjectTimeline (fuente única; el Kickoff lo
    // refleja). Render especial en ProjectCanvasPanel (branch name==="Cronograma").
    name: "Cronograma",
    isDefault: false,
    order: 4,
    sections: [],
  },
];

/** Map from agentGroup to canvas name for routing cards/blocks.
 *  Fuente ÚNICA — app/api/clients/[id]/analyze/route.ts la importa de acá
 *  (antes estaba duplicada; centralizada en Kickoff Fase A). */
export const AGENT_GROUP_TO_CANVAS: Record<string, string> = {
  diagnostico: "Diagnóstico",
  planificacion: "Planificación",
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
      order: c.order,
      sections: c.sections, // Keep JSON for backward compat
    })),
  });

  // Create CanvasSection records for every canvas that defines sections (incl.
  // the home canvas Handoff). Canvases sin secciones (Cronograma) no llevan.
  const createdCanvases = await prisma.projectCanvas.findMany({
    where: { projectId },
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
