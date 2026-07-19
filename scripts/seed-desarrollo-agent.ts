/**
 * scripts/seed-desarrollo-agent.ts
 *
 * Crea (o actualiza) el agente "Desarrollo (requerimiento técnico)" — id estable
 * "agent-desarrollo-canvas". UPSERT idempotente.
 *
 * El agente:
 *   - agentGroup "desarrollo" → routea al canvas "Desarrollo" (AGENT_GROUP_TO_CANVAS)
 *     y al gate de permisos (resolveArtifactGate → sección desarrollo).
 *   - El Agent record existe para el LOOKUP de /analyze (botón manual), el gating y la
 *     UI. La generación NO usa este `systemPrompt`: /analyze delega en el runner
 *     `runDesarrolloGeneration`, cuyo prompt real vive en DESARROLLO_TEMPLATE.agentIntro
 *     (components/landing/configs/desarrollo.defs.ts). Mantener el prompt en el template
 *     evita duplicarlo y desincronizarlo.
 *
 * Uso: npx tsx scripts/seed-desarrollo-agent.ts
 */
import { createScriptDb } from "./lib/db";

// Pool acotado (max:2) — no comerse los slots compartidos del pooler (ver scripts/lib/db.ts).
const { prisma, pool } = createScriptDb();

const AGENT_ID = "agent-desarrollo-canvas";
const DESCRIPTION =
  "Genera el REQUERIMIENTO TÉCNICO (canvas Desarrollo) para el equipo de desarrollo a partir de la sección `desarrollo` del handoff + alcance + deal. 5 secciones técnicas (retos, criterios de éxito, arquitectura/IDs, mapeo de entidades, triggers/flujos). El prompt real vive en DESARROLLO_TEMPLATE; la generación la corre runDesarrolloGeneration.";
// Nota corta en el campo systemPrompt: el prompt de generación efectivo está en el
// template (DESARROLLO_TEMPLATE.agentIntro), no acá.
const SYSTEM_PROMPT_NOTE =
  "Agente del canvas Desarrollo (requerimiento técnico). La generación usa DESARROLLO_TEMPLATE (components/landing/configs/desarrollo.defs.ts) vía runDesarrolloGeneration — este campo no se usa para generar.";

async function main() {
  console.log(`Sembrando agente Desarrollo (id=${AGENT_ID})...\n`);

  const agent = await prisma.agent.upsert({
    where: { id: AGENT_ID },
    update: {
      name: "Desarrollo (requerimiento técnico)",
      description: DESCRIPTION,
      agentGroup: "desarrollo",
      defaultCanvasSection: "requerimiento",
      systemPrompt: SYSTEM_PROMPT_NOTE,
      status: "ACTIVE",
    },
    create: {
      id: AGENT_ID,
      name: "Desarrollo (requerimiento técnico)",
      description: DESCRIPTION,
      systemPrompt: SYSTEM_PROMPT_NOTE,
      status: "ACTIVE",
      agentGroup: "desarrollo",
      groupOrder: 0,
      defaultCanvasSection: "requerimiento",
      associatedStages: [],
    },
    select: { id: true, name: true, agentGroup: true, defaultCanvasSection: true, status: true },
  });

  console.log("Agente:");
  console.log(`  id:                   ${agent.id}`);
  console.log(`  name:                 ${agent.name}`);
  console.log(`  agentGroup:           ${agent.agentGroup}`);
  console.log(`  defaultCanvasSection: ${agent.defaultCanvasSection}`);
  console.log(`  status:               ${agent.status}`);
  console.log("✓ OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
