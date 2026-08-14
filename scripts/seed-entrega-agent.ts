/**
 * scripts/seed-entrega-agent.ts
 *
 * Upsert idempotente del agente del canvas "Entrega" — el documento con el que se cierra un
 * proyecto y que se le comparte al cliente.
 *
 * La generación NO usa este `systemPrompt`: /analyze delega en el runner
 * `runEntregaGeneration` (lib/canvas/entrega-generate.ts), cuyo prompt real vive en
 * `ENTREGA_TEMPLATE.agentIntro` y en los briefs por sección.
 *
 * ⚠ QUÉ NO ESCRIBE ESTE AGENTE: las dos secciones con cifras («El plan, cumplido» y «Qué queda
 * abierto»). Las calcula el runner desde el cronograma y ni siquiera viajan al modelo. Está
 * declarado en la descripción a propósito: quien mire el catálogo /agents tiene que poder saber
 * qué NO hace este agente sin abrir el código.
 *
 * Correr con: npx tsx scripts/seed-entrega-agent.ts
 */
import { createScriptDb } from "./lib/db";

const { prisma, close } = createScriptDb();

const AGENT_ID = "agent-entrega-canvas";
const NAME = "Entrega (documento de cierre)";

const DESCRIPTION =
  "Escribe el documento con el que se cierra un proyecto y se le comparte al cliente: de dónde " +
  "salieron y dónde están, qué quedó implementado por Hub, qué objetivos se alcanzaron y cómo " +
  "sigue el acompañamiento. Fuentes: el handoff (ancla), el kickoff, el requerimiento técnico, " +
  "los procesos y las últimas reuniones con transcripción. " +
  "NO escribe ningún número del proyecto —tareas, fases, semanas, fechas— : esos los calcula " +
  "Nexus del cronograma. Los números del negocio del cliente los PROPONE con su cita textual " +
  "y solo llegan al cliente si el CSE los acepta.";

const SYSTEM_PROMPT_NOTE =
  "[NOTA] Este campo no se usa para generar. El prompt real vive en ENTREGA_TEMPLATE.agentIntro " +
  "(components/landing/configs/entrega.defs.ts) y en los briefs por sección. La generación corre " +
  "por runEntregaGeneration (lib/canvas/entrega-generate.ts), delegada desde " +
  "POST /api/clients/[id]/analyze.";

async function main() {
  /* Molde que COMPARA antes de escribir, no el que pisa. Si alguien calibró el prompt desde
     /agents, un re-seed a ciegas le borra el trabajo sin preguntar — y en producción eso no se
     nota hasta la próxima generación, que ya salió distinta. Con `--force` se pisa a sabiendas. */
  const force = process.argv.includes("--force");
  const existing = await prisma.agent.findUnique({
    where: { id: AGENT_ID },
    select: { systemPrompt: true, description: true },
  });
  if (existing && !force && (existing.systemPrompt !== SYSTEM_PROMPT_NOTE || existing.description !== DESCRIPTION)) {
    console.log(
      `[seed-entrega-agent] ⚠ El agente ya existe y su texto DIFIERE del de este script ` +
        `(¿lo calibró alguien desde /agents?). No se toca.\n` +
        `    Para pisarlo a propósito: npx tsx scripts/seed-entrega-agent.ts --force`,
    );
    return;
  }

  const agent = await prisma.agent.upsert({
    where: { id: AGENT_ID },
    create: {
      id: AGENT_ID,
      name: NAME,
      description: DESCRIPTION,
      systemPrompt: SYSTEM_PROMPT_NOTE,
      /* ⚠ ACTIVE explícito. El default del API es DRAFT, y un DRAFT que el resolver elige
         devuelve 200 con `NO_AGENT_CONFIGURED` — el botón "no hace nada" y no hay error. */
      status: "ACTIVE",
      agentType: "SECTION",
      outputType: "CARDS",
      scope: "CLIENT",
      agentGroup: "entrega",
      // Tiene que ser una key que EXISTA en el canvas, o el bloque cae en la nada.
      defaultCanvasSection: "portada",
      groupOrder: 0,
      associatedStages: [],
    },
    update: { name: NAME, description: DESCRIPTION, systemPrompt: SYSTEM_PROMPT_NOTE, agentGroup: "entrega" },
  });
  console.log(`[seed-entrega-agent] OK — ${agent.id} (${agent.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => close());
