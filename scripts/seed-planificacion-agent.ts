/**
 * scripts/seed-planificacion-agent.ts
 *
 * Crea (o actualiza) el agente "Planificación" — id estable
 * "agent-planificacion-canvas". El canvas "Planificación" del proyecto NO tenía
 * agente; este lo llena en formato sections+blocks (igual que Kickoff/Diagnóstico).
 *
 * El agente:
 *   - agentGroup "planificacion" → routea al canvas "Planificación"
 *     (AGENT_GROUP_TO_CANVAS) y hereda el formato block (BLOCK_FORMAT_GROUPS en
 *     analyze/route.ts).
 *   - su INPUT es el HANDOFF + el DIAGNÓSTICO curados del proyecto — eso lo arma
 *     analyze/route.ts (rama isPlanificacionAgent), no las fuentes crudas.
 *
 * Uso: npx tsx scripts/seed-planificacion-agent.ts
 */
import { createScriptDb } from "./lib/db";

// Presupuesto de conexiones ACOTADO (scripts/lib/db.ts): el pooler comparte ~15 slots
// con producción y las dos PCs de dev; un pool sin tope se comía 10 él solo.
const { prisma, close } = createScriptDb();

const AGENT_ID = "agent-planificacion-canvas";

const PLANIFICACION_SYSTEM_PROMPT =
  "[NOTA] Este campo no se usa para generar. El prompt real de la planificación vive en " +
  "PLANIFICACION_TEMPLATE.agentIntro (components/landing/configs/planificacion.defs.ts) y en " +
  "los briefs por sección — conserva las reglas del prompt anterior: SIN fechas (el calendario " +
  "vive en el Cronograma), degradación honesta con contexto delgado, y lo fuera de alcance " +
  "marcado. La generación corre por runPlanificacionGeneration " +
  "(lib/canvas/planificacion-generate.ts), delegada desde POST /api/clients/[id]/analyze.";

async function main() {
  console.log(`Sembrando agente Planificación (id=${AGENT_ID})...\n`);

  const agent = await prisma.agent.upsert({
    where: { id: AGENT_ID },
    update: {
      name: "Planificación",
      description:
        "Genera el PLAN DE IMPLEMENTACIÓN (interno) a partir del handoff + el diagnóstico curados del proyecto. 4 secciones en formato block: arquitectura, roadmap conceptual, procesos y métricas. Las fechas viven en el canvas Cronograma.",
      agentGroup: "planificacion",
      defaultCanvasSection: "planificacion",
      systemPrompt: PLANIFICACION_SYSTEM_PROMPT,
      status: "ACTIVE",
    },
    create: {
      id: AGENT_ID,
      name: "Planificación",
      description:
        "Genera el PLAN DE IMPLEMENTACIÓN (interno) a partir del handoff + el diagnóstico curados del proyecto. 4 secciones en formato block: arquitectura, roadmap conceptual, procesos y métricas. Las fechas viven en el canvas Cronograma.",
      systemPrompt: PLANIFICACION_SYSTEM_PROMPT,
      status: "ACTIVE",
      agentGroup: "planificacion",
      groupOrder: 0,
      defaultCanvasSection: "planificacion",
      associatedStages: [],
      // outputType (CARDS), scope (CLIENT), agentType (SECTION) → defaults del schema.
      // El formato real (sections+blocks) lo gobierna BLOCK_FORMAT_GROUPS en analyze.
    },
    select: { id: true, name: true, agentGroup: true, defaultCanvasSection: true, status: true },
  });

  console.log("Agente:");
  console.log(`  id:                   ${agent.id}`);
  console.log(`  name:                 ${agent.name}`);
  console.log(`  agentGroup:           ${agent.agentGroup}`);
  console.log(`  defaultCanvasSection: ${agent.defaultCanvasSection}`);
  console.log(`  status:               ${agent.status}`);
  console.log(`\nSystem prompt: ${PLANIFICACION_SYSTEM_PROMPT.length} chars`);
  console.log("✓ OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => close());
