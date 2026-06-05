import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

// Acepta el cliente global o un cliente de transacción ($transaction) para que la
// creación de canvases sea atómica con el resto del orquestador (Fase 4 handoff).
type Db = Prisma.TransactionClient;

type CanvasDefinition = {
  name: string;
  isDefault: boolean;
  order: number;
  sections: Array<{ key: string; label: string }>;
};

// ── Canvas Handoff (traspaso Sales→CS) ────────────────────────────────────────
// YA NO se crea con createDefaultCanvases: el handoff es una entidad cliente-level
// (model Handoff) que arranca el proyecto, y su canvas lo monta el FLUJO de
// creación de handoffs (createHandoffCanvas, Fase 4). Se mantiene la definición
// acá como fuente ÚNICA de las 8 secciones — el agente "Handoff Sales→CS" escribe
// en ellas vía AGENT_GROUP_TO_CANVAS. Cada sección 1:1 con una card del agente.
export const HANDOFF_CANVAS: CanvasDefinition = {
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
};

// Orden = flujo real del onboarding (SIN Handoff, que migró a entidad cliente-level):
// Kickoff → Diagnóstico → Planificación → Cronograma. El array ES la fuente del
// `order`. El ancla/default (isDefault → fallback cuando no hay canvas elegido + no
// borrable desde la UI) es KICKOFF.
export const DEFAULT_PROJECT_CANVASES: CanvasDefinition[] = [
  {
    // Kickoff (Fase A): landing de arranque DE CARA AL CLIENTE. El cronograma NO
    // es una sección — la plantilla lo pinta desde ProjectTimeline. ANCLA/default
    // del proyecto (isDefault → fallback cuando no hay canvas seleccionado + no
    // borrable desde la UI).
    name: "Kickoff",
    isDefault: true,
    order: 0,
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
    order: 1,
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
    order: 2,
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
    order: 3,
    sections: [],
  },
];

/** Map from agentGroup to canvas name for routing cards/blocks.
 *  Fuente ÚNICA — app/api/clients/[id]/analyze/route.ts la importa de acá
 *  (antes estaba duplicada; centralizada en Kickoff Fase A).
 *  `handoff` SE MANTIENE: el agente sigue escribiendo al canvas "Handoff" del
 *  proyecto, que ahora lo crea el flujo de handoff (createHandoffCanvas). */
export const AGENT_GROUP_TO_CANVAS: Record<string, string> = {
  diagnostico: "Diagnóstico",
  planificacion: "Planificación",
  handoff: "Handoff",
  kickoff: "Kickoff",
};

/** Create all standard canvases for a project with CanvasSection records.
 *  NO incluye Handoff (es entidad cliente-level; usar createHandoffCanvas). */
export async function createDefaultCanvases(projectId: string, db: Db = prisma) {
  // Create all canvases
  await db.projectCanvas.createMany({
    data: DEFAULT_PROJECT_CANVASES.map((c) => ({
      projectId,
      name: c.name,
      isDefault: c.isDefault,
      order: c.order,
      sections: c.sections, // Keep JSON for backward compat
    })),
  });

  // Create CanvasSection records for every canvas that defines sections.
  // Canvases sin secciones (Cronograma) no llevan.
  const createdCanvases = await db.projectCanvas.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });

  for (const canvas of createdCanvases) {
    const def = DEFAULT_PROJECT_CANVASES.find((d) => d.name === canvas.name);
    if (!def?.sections.length) continue;
    await db.canvasSection.createMany({
      data: def.sections.map((s, i) => ({
        canvasId: canvas.id,
        key: s.key,
        label: s.label,
        order: i,
      })),
    });
  }
}

/** Crea el canvas "Handoff" (+8 secciones) para un proyecto. Lo usa el FLUJO de
 *  creación de handoffs (Fase 4) — el handoff arranca el proyecto y monta su canvas.
 *  Asume que el proyecto aún no tiene canvas Handoff (proyecto recién creado). */
export async function createHandoffCanvas(projectId: string, db: Db = prisma): Promise<string> {
  const canvas = await db.projectCanvas.create({
    data: {
      projectId,
      name: HANDOFF_CANVAS.name,
      isDefault: HANDOFF_CANVAS.isDefault,
      order: HANDOFF_CANVAS.order,
      sections: HANDOFF_CANVAS.sections,
    },
    select: { id: true },
  });

  await db.canvasSection.createMany({
    data: HANDOFF_CANVAS.sections.map((s, i) => ({
      canvasId: canvas.id,
      key: s.key,
      label: s.label,
      order: i,
    })),
  });

  return canvas.id;
}
