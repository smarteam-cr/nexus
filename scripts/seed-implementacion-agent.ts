/**
 * scripts/seed-implementacion-agent.ts
 *
 * Upsert idempotente del agente del canvas "Implementación" (la guía de construcción
 * del CSE: arquitectura de propiedades, pipelines, procesos de marketing, y los prompts
 * para que Breeze construya lo que pueda).
 *
 * La generación NO usa este `systemPrompt`: /analyze delega en el runner
 * `runImplementacionGeneration` (lib/canvas/implementacion-generate.ts), cuyo prompt
 * real vive en `IMPLEMENTACION_TEMPLATE.agentIntro`.
 *
 * Correr con: npx tsx scripts/seed-implementacion-agent.ts
 * (Upsert por id — seguro contra la base compartida.)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DESCRIPTION =
  "Escribe la guía de construcción del portal: la arquitectura de propiedades, los pipelines " +
  "por objeto (etapas actuales vs propuestas), los procesos de marketing, y los prompts " +
  "LITERALES para que Breeze construya lo decidido — con lo que Breeze no cubre como lista de " +
  "trabajo del CSE. Fuentes: la planificación aprobada (ancla), el requerimiento técnico (sin " +
  "duplicarlo), el portal real y la spec de Breeze de la base de conocimiento (si no está " +
  "publicada, los prompts salen marcados 'sin verificar').";

const SYSTEM_PROMPT_NOTE =
  "[NOTA] Este campo no se usa para generar. El prompt real vive en " +
  "IMPLEMENTACION_TEMPLATE.agentIntro (components/landing/configs/implementacion.defs.ts) y " +
  "en los briefs por sección. La generación corre por runImplementacionGeneration " +
  "(lib/canvas/implementacion-generate.ts), delegada desde POST /api/clients/[id]/analyze.";

async function main() {
  const agent = await prisma.agent.upsert({
    where: { id: "agent-implementacion-canvas" },
    create: {
      id: "agent-implementacion-canvas",
      name: "Implementación (guía de construcción)",
      description: DESCRIPTION,
      systemPrompt: SYSTEM_PROMPT_NOTE,
      status: "ACTIVE",
      agentType: "SECTION",
      outputType: "CARDS",
      scope: "CLIENT",
      agentGroup: "implementacion",
      defaultCanvasSection: "implementacion",
      groupOrder: 0,
      associatedStages: [],
    },
    update: {
      name: "Implementación (guía de construcción)",
      description: DESCRIPTION,
      systemPrompt: SYSTEM_PROMPT_NOTE,
      status: "ACTIVE",
      agentGroup: "implementacion",
      defaultCanvasSection: "implementacion",
    },
  });
  console.log(`[seed-implementacion-agent] OK — ${agent.id} (${agent.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
