/**
 * scripts/seed-kickoff-agent.ts
 *
 * Crea (o actualiza) el agente "Kickoff (landing cliente)" — id estable
 * "agent-kickoff-canvas". A diferencia del Handoff (que reorienta un agente
 * existente), acá NO hay agente que reciclar, así que se hace UPSERT: lo crea
 * la primera vez y lo deja idempotente en corridas posteriores.
 *
 * El agente:
 *   - agentGroup "kickoff" → routea al canvas "Kickoff" (AGENT_GROUP_TO_CANVAS).
 *   - usa el formato sections+blocks (está en BLOCK_FORMAT_AGENT_IDS de analyze).
 *   - su INPUT es el handoff CURADO (bloques CONFIRMED) + el cronograma — eso lo
 *     arma analyze/route.ts (rama isKickoffAgent), no las fuentes crudas.
 *
 * Uso: npx tsx scripts/seed-kickoff-agent.ts
 */
import { createScriptDb } from "./lib/db";

// Pool acotado (max:2) — no comerse los slots compartidos del pooler (ver scripts/lib/db.ts).
const { prisma, pool } = createScriptDb();

const AGENT_ID = "agent-kickoff-canvas";

// ⚠️ NOTA-PUNTERO (no un prompt real): el kickoff migró al motor de secciones
// TIPADAS — el prompt que GENERA de verdad es `KICKOFF_TEMPLATE.agentIntro` +
// los `brief` por sección en components/landing/configs/kickoff.defs.ts
// (+ las reglas compartidas de canvas-agent.ts). Editar la voz del kickoff = editar
// ESOS archivos. Este systemPrompt en DB quedó vestigial (una copia completa acá
// se desactualizaba en silencio y alguien podía editarla sin efecto).
const KICKOFF_SYSTEM_PROMPT = `[NOTA] Este agente genera con el prompt del código, no con este campo.
El prompt real vive en components/landing/configs/kickoff.defs.ts (KICKOFF_TEMPLATE.agentIntro + briefs por sección)
y las reglas compartidas de voz en lib/business-cases/canvas-agent.ts (BRAND_VOICE_RULES).
Editar la voz del kickoff = editar esos archivos y desplegar. Este registro solo da identidad/routeo al agente.`;

async function main() {
  console.log(`Sembrando agente Kickoff (id=${AGENT_ID})...\n`);

  const agent = await prisma.agent.upsert({
    where: { id: AGENT_ID },
    update: {
      name: "Kickoff (landing cliente)",
      description:
        "Genera la landing de kickoff DE CARA AL CLIENTE a partir del handoff ya curado (bloques CONFIRMED) + el cronograma. 6 secciones cliente-facing en formato block; el cronograma lo pinta la plantilla desde ProjectTimeline.",
      agentGroup: "kickoff",
      defaultCanvasSection: "bienvenida",
      systemPrompt: KICKOFF_SYSTEM_PROMPT,
      status: "ACTIVE",
    },
    create: {
      id: AGENT_ID,
      name: "Kickoff (landing cliente)",
      description:
        "Genera la landing de kickoff DE CARA AL CLIENTE a partir del handoff ya curado (bloques CONFIRMED) + el cronograma. 6 secciones cliente-facing en formato block; el cronograma lo pinta la plantilla desde ProjectTimeline.",
      systemPrompt: KICKOFF_SYSTEM_PROMPT,
      status: "ACTIVE",
      agentGroup: "kickoff",
      groupOrder: 0,
      defaultCanvasSection: "bienvenida",
      associatedStages: [],
      // outputType (CARDS), scope (CLIENT), agentType (SECTION) → defaults del schema.
      // El formato real (sections+blocks) lo gobierna BLOCK_FORMAT_AGENT_IDS en analyze.
    },
    select: { id: true, name: true, agentGroup: true, defaultCanvasSection: true, status: true },
  });

  console.log("Agente:");
  console.log(`  id:                   ${agent.id}`);
  console.log(`  name:                 ${agent.name}`);
  console.log(`  agentGroup:           ${agent.agentGroup}`);
  console.log(`  defaultCanvasSection: ${agent.defaultCanvasSection}`);
  console.log(`  status:               ${agent.status}`);
  console.log(`\nSystem prompt: ${KICKOFF_SYSTEM_PROMPT.length} chars`);
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
