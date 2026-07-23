/**
 * scripts/seed-exploracion-agent.ts
 *
 * Crea (o actualiza) el agente "Exploración (descubrimiento del negocio)" — id estable
 * "agent-exploracion-canvas". UPSERT idempotente.
 *
 * El agente:
 *   - agentGroup "exploracion" → routea al canvas "Exploración" (AGENT_GROUP_TO_CANVAS)
 *     y al gate de permisos (resolveArtifactGate → sección exploracion).
 *   - El Agent record existe para el LOOKUP de /analyze (botón manual), el gating y la
 *     UI de /agents. La generación NO usa este `systemPrompt`: /analyze delega en el
 *     runner `runExploracionGeneration`, cuyo prompt real vive en
 *     EXPLORACION_TEMPLATE.agentIntro (components/landing/configs/exploracion.defs.ts).
 *     Mantener el prompt en el template evita duplicarlo y desincronizarlo.
 *
 * Uso: npx tsx scripts/seed-exploracion-agent.ts
 */
import { createScriptDb } from "./lib/db";

// Pool acotado (max:2) — no comerse los slots compartidos del pooler (ver scripts/lib/db.ts).
const { prisma, pool } = createScriptDb();

const AGENT_ID = "agent-exploracion-canvas";
const DESCRIPTION =
  "Genera la GUÍA INTERNA DE EXPLORACIÓN (canvas Exploración) que usa el CSE cuando el kickoff ya pasó: separa lo que el handoff ya confirmó de lo que se dio por supuesto y nadie verificó, y de esos supuestos deriva el plan de sesiones (qué preguntar, en qué orden, con quién). Fuentes por peso: handoff ancla → historial del cliente → etiquetas → canvases del proyecto. El prompt real vive en EXPLORACION_TEMPLATE; la generación la corre runExploracionGeneration.";
// Nota corta en el campo systemPrompt: el prompt de generación efectivo está en el
// template (EXPLORACION_TEMPLATE.agentIntro), no acá.
const SYSTEM_PROMPT_NOTE =
  "Agente del canvas Exploración (guía interna de descubrimiento del negocio). La generación usa EXPLORACION_TEMPLATE (components/landing/configs/exploracion.defs.ts) vía runExploracionGeneration — este campo no se usa para generar.";

async function main() {
  console.log(`Sembrando agente Exploración (id=${AGENT_ID})...\n`);

  const agent = await prisma.agent.upsert({
    where: { id: AGENT_ID },
    update: {
      name: "Exploración (descubrimiento del negocio)",
      description: DESCRIPTION,
      agentGroup: "exploracion",
      defaultCanvasSection: "exploracion",
      systemPrompt: SYSTEM_PROMPT_NOTE,
      status: "ACTIVE",
    },
    create: {
      id: AGENT_ID,
      name: "Exploración (descubrimiento del negocio)",
      description: DESCRIPTION,
      systemPrompt: SYSTEM_PROMPT_NOTE,
      status: "ACTIVE",
      agentGroup: "exploracion",
      groupOrder: 0,
      defaultCanvasSection: "exploracion",
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
