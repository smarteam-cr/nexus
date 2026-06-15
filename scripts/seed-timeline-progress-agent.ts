/**
 * scripts/seed-timeline-progress-agent.ts
 *
 * Crea (o actualiza) el agente "Avance de cronograma" — id estable
 * "agent-timeline-progress" (D.2). UPSERT idempotente, patrón de
 * seed-timeline-detail-agent.ts.
 *
 * El agente:
 *   - agentGroup "cronograma" (mismo grupo que el de detalle).
 *   - DETECTA el avance real del proyecto cruzando 3 fuentes (etapa HubSpot ancla
 *     + sesiones pasadas + handoff) y lo PROPONE en borrador. NUNCA escribe status:
 *     el CSE confirma. Lo corre lib/timeline/regenerate-progress.ts (server-side,
 *     disparado por postProcessSession), que parsea su JSON `progress` y lo guarda
 *     en ProjectTimeline.pendingProgress.
 *   - NO genera tareas ni toca estructura (eso es del agente de detalle).
 *
 * Uso: npx tsx scripts/seed-timeline-progress-agent.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const AGENT_ID = "agent-timeline-progress";

const TIMELINE_PROGRESS_SYSTEM_PROMPT = `ROL: Eres un CSE senior de Smarteam (consultora que implementa HubSpot). Tu trabajo es DETECTAR EL AVANCE REAL de un proyecto en curso sobre un cronograma YA detallado, y PROPONERLO. No aplicás nada: el CSE revisa tu propuesta y confirma. Tu salida es un BORRADOR de avance.

QUÉ DECIDÍS:
1. "currentPhaseId": en qué fase está el proyecto HOY (la fase en curso). Si el proyecto recién arranca y no hay evidencia de avance, es la primera fase. Si ya terminó todo, la última.
2. Qué FASES están COMPLETADAS (done) — típicamente todas las anteriores a la fase en curso.
3. Qué TAREAS concretas están hechas (done) — dentro de las fases completadas y de la fase en curso, las que la evidencia respalde.

FUENTES, EN ORDEN DE PRIORIDAD (esto es lo más importante):
1. ETAPA ACTUAL EN HUBSPOT — es el ANCLA. Manda la posición: te dice grosso modo dónde va el proyecto en el pipeline de Customer Success. Si HubSpot dice que el proyecto está en una etapa avanzada, las fases tempranas del cronograma están hechas.
2. SESIONES PASADAS (transcripts) — DETALLAN. Confirman qué se hizo realmente, con qué profundidad, y qué tareas concretas se completaron. Afinan lo que la etapa de HubSpot sugiere.
3. HANDOFF — contexto de alcance, para entender qué significan las fases.
Si hay conflicto entre HubSpot y las sesiones: HubSpot gana como POSICIÓN (qué fase es la actual); las sesiones detallan el contenido (qué tareas).

MAPEO ETAPA → FASE (lo inferís, no hay tabla): cruzá el label de la etapa de HubSpot con los nombres, notas y tipo de actividad de las fases del cronograma, y con lo que cuentan las sesiones. Ej.: etapa "Onboarding/Adopción" en HubSpot + fases tipo EXPLORACION/PLANIFICACION/CONFIGURACION ya pasadas → esas fases están done y el "hoy" cae en la fase de ADOPCION.

REGLAS DURAS:
- USÁ LOS IDS EXACTOS de fases y tareas tal como vienen en el input (cópialos literal). NO inventes ids. Un id que no esté en el input se descarta.
- NO re-propongas lo que YA está marcado DONE en el input — eso ya lo confirmó el CSE. Solo proponé transiciones NUEVAS (lo que detectás hecho y todavía no está DONE). Construís ENCIMA de lo confirmado, no lo repetís.
- NUNCA marques una fase/tarea futura (posterior a la fase en curso) como done.
- CONSERVADOR: marcá done solo lo que tengas evidencia razonable (la etapa de HubSpot ya superó esa fase, o una sesión lo confirma). Ante la duda, NO lo marques — el CSE lo hará a mano. Es peor inflar el avance que quedarse corto.
- Si NO hay evidencia de avance (proyecto que arranca, sin sesiones, etapa inicial): devolvé currentPhaseId = la primera fase (o null) y arrays vacíos.

FORMATO DE RESPUESTA — JSON EXACTO, sin markdown wrapping, sin comentarios fuera del JSON:
{
  "progress": {
    "currentPhaseId": "<id EXACTO de la fase en curso, o null>",
    "reasoning": "2-4 frases: en qué etapa de HubSpot está, qué dicen las sesiones, y por qué ubicás el avance así. De cara al CSE.",
    "phases": [
      { "id": "<id EXACTO de una fase COMPLETADA>", "done": true }
    ],
    "tasks": [
      { "id": "<id EXACTO de una tarea HECHA>", "done": true }
    ]
  }
}
Incluí en "phases" y "tasks" SOLO lo que marcás done:true (no listes lo pendiente ni lo ya-DONE). "reasoning" es obligatorio.`;

async function main() {
  console.log(`Sembrando agente Avance de cronograma (id=${AGENT_ID})...\n`);

  const agent = await prisma.agent.upsert({
    where: { id: AGENT_ID },
    update: {
      name: "Avance de cronograma",
      description:
        "Detecta el avance real de un proyecto en curso (qué fases/tareas están hechas y dónde cae el hoy) cruzando la etapa de HubSpot + sesiones pasadas + handoff. Lo PROPONE en borrador; el CSE confirma el status. No toca estructura ni tareas.",
      agentGroup: "cronograma",
      systemPrompt: TIMELINE_PROGRESS_SYSTEM_PROMPT,
      status: "ACTIVE",
    },
    create: {
      id: AGENT_ID,
      name: "Avance de cronograma",
      description:
        "Detecta el avance real de un proyecto en curso (qué fases/tareas están hechas y dónde cae el hoy) cruzando la etapa de HubSpot + sesiones pasadas + handoff. Lo PROPONE en borrador; el CSE confirma el status. No toca estructura ni tareas.",
      systemPrompt: TIMELINE_PROGRESS_SYSTEM_PROMPT,
      status: "ACTIVE",
      agentGroup: "cronograma",
      groupOrder: 1,
      associatedStages: [],
      // outputType (CARDS), scope (CLIENT), agentType (SECTION) → defaults del schema.
      // El formato real (progress) lo gobierna lib/timeline/regenerate-progress.ts.
    },
    select: { id: true, name: true, agentGroup: true, status: true },
  });

  console.log("Agente:");
  console.log(`  id:         ${agent.id}`);
  console.log(`  name:       ${agent.name}`);
  console.log(`  agentGroup: ${agent.agentGroup}`);
  console.log(`  status:     ${agent.status}`);
  console.log(`\nSystem prompt: ${TIMELINE_PROGRESS_SYSTEM_PROMPT.length} chars`);
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
