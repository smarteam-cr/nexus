/**
 * scripts/seed-diagnostico-agent.ts
 *
 * Upsert idempotente del agente del canvas "Diagnóstico" (informe de rendimiento para
 * el cliente). Reemplaza a scripts/create-diagnostico-canvas-agent.ts Y al bloque que
 * vivía en prisma/seed.ts — había DOS seeds del MISMO id en conflicto (uno decía 6
 * secciones, el otro 8): ganaba el último que corriera, y el agente podía emitir keys
 * que no matcheaban las secciones del canvas → no se escribía nada, en silencio.
 *
 * La generación NO usa este `systemPrompt`: /analyze delega en el runner
 * `runDiagnosticoGeneration` (lib/canvas/diagnostico-generate.ts), cuyo prompt real
 * vive en `DIAGNOSTICO_TEMPLATE.agentIntro` (components/landing/configs/
 * diagnostico.defs.ts) junto a los briefs por sección. El registro Agent existe para:
 * el lookup del botón (agentId), la celda de permisos (agentGroup → artifact-gate),
 * el catálogo de /agents y la trazabilidad (AgentRun.agentId).
 *
 * Correr con: npx tsx scripts/seed-diagnostico-agent.ts
 * (Upsert por id — seguro contra la base compartida.)
 */
import { createScriptDb } from "./lib/db";

// Presupuesto de conexiones ACOTADO (scripts/lib/db.ts): el pooler comparte ~15 slots
// con producción y las dos PCs de dev; un pool sin tope se comía 10 él solo.
const { prisma, close } = createScriptDb();

const DESCRIPTION =
  "Escribe el informe de diagnóstico de rendimiento PARA EL CLIENTE: cómo opera hoy por hub, " +
  "dónde está en la Escala de Rendimiento 1-5 (global y por área), qué factores explican el " +
  "nivel, qué lo separa del siguiente y qué hacemos. Fuentes: la escala canónica (base de " +
  "conocimiento), el handoff (solo lo apto para cliente), la exploración (lo 'sin verificar' " +
  "nunca se afirma), los procesos reales mapeados (con su fricción) y el cronograma.";

const SYSTEM_PROMPT_NOTE =
  "[NOTA] Este campo no se usa para generar. El prompt real del diagnóstico vive en " +
  "DIAGNOSTICO_TEMPLATE.agentIntro (components/landing/configs/diagnostico.defs.ts) y en los " +
  "briefs por sección. La generación corre por runDiagnosticoGeneration " +
  "(lib/canvas/diagnostico-generate.ts), delegada desde POST /api/clients/[id]/analyze.";

async function main() {
  const agent = await prisma.agent.upsert({
    where: { id: "agent-diagnostico-canvas" },
    create: {
      id: "agent-diagnostico-canvas",
      name: "Diagnóstico de rendimiento",
      description: DESCRIPTION,
      systemPrompt: SYSTEM_PROMPT_NOTE,
      status: "ACTIVE",
      agentType: "SECTION",
      outputType: "CARDS",
      scope: "CLIENT",
      agentGroup: "diagnostico",
      defaultCanvasSection: "diagnostico",
      groupOrder: 0,
      associatedStages: [],
    },
    update: {
      name: "Diagnóstico de rendimiento",
      description: DESCRIPTION,
      systemPrompt: SYSTEM_PROMPT_NOTE,
      status: "ACTIVE",
      agentGroup: "diagnostico",
      defaultCanvasSection: "diagnostico",
    },
  });
  console.log(`[seed-diagnostico-agent] OK — ${agent.id} (${agent.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => close());
