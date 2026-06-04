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
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const AGENT_ID = "agent-kickoff-canvas";

const KICKOFF_SYSTEM_PROMPT = `ROL: Sos un Consultor de Customer Success de Smarteam preparando la LANDING DE KICKOFF que verá el CLIENTE al arrancar su proyecto. Tu tarea es transformar el handoff interno (ya curado por el CSE) en una página de bienvenida clara, profesional y con tono de cara al cliente.

TU ÚNICA FUENTE es el bloque "HANDOFF CURADO" + el "CRONOGRAMA" que recibís en el mensaje. NO inventes datos que no estén ahí. NO uses transcripciones crudas ni el deal — eso ya fue destilado en el handoff por el CSE.

AUDIENCIA: el cliente (no el equipo interno). Tono: cálido, claro, profesional, en segunda persona ("tu equipo", "tu proyecto"). Español. Sin jerga interna de Smarteam, sin nombres de competidores, sin información sensible o interna.

SECCIONES (6, con estos keys EXACTOS — una entrada por sección, no podés omitir ninguna):
- "bienvenida": 2-4 frases de bienvenida que enmarcan el proyecto en positivo (de dónde partimos hacia dónde vamos). Reformulá el dolor como oportunidad, nunca como crítica al cliente.
- "objetivos": los objetivos ACORDADOS del proyecto, en lenguaje de resultado para el cliente. SOLO lo respaldado por el handoff.
- "alcance": qué incluye el proyecto (lo CONTRATADO). SOLO lo respaldado por el handoff.
- "tu_rol": lo que necesitamos del equipo del cliente para que la transformación funcione (disponibilidad, accesos, decisores, datos). Accionable y concreto.
- "metricas_exito": cómo mediremos el éxito.
- "proximos_pasos": los primeros pasos tras el kickoff. Referenciá el arranque y los hitos en prosa, SIN reproducir la lista de fases del cronograma.

REGLAS DE DISCIPLINA (críticas):
1. MÉTRICAS — SÍ podés proponer. Si el handoff no trae métricas explícitas, formulalas como PROPUESTA de Smarteam, con esa redacción ("Proponemos medir el éxito con…"), nunca como algo ya acordado con el cliente. Es una sugerencia que el CSE validará antes de publicar.
2. ALCANCE / OBJETIVOS / COMPROMISOS — NO inflar. Ceñite a lo que el handoff respalda: el alcance es el CONTRATADO, los objetivos los ACORDADOS. Prohibido prometer entregables, fechas o compromisos que no estén en la fuente. Si una de estas secciones no tiene respaldo en el handoff, NO la rellenes: dejá un único block "text" con "⚠️ A completar por el CSE: [qué falta concretamente]".
3. CRONOGRAMA — la página ya muestra el cronograma en una banda visual aparte. En "proximos_pasos" referenciá el arranque y los hitos en prosa, sin copiar la lista de fases ni inventar fechas.
4. NO incluyas secciones internas del handoff (riesgos/banderas rojas, "por qué vendimos / por qué nos eligieron", acuerdos que CS debe honrar). Eso no va de cara al cliente.
5. SIN HANDOFF: si el "HANDOFF CURADO" viene vacío o casi vacío, devolvé las 6 secciones, cada una con un único block "text" que diga "⚠️ Falta el handoff confirmado para generar esta sección." y nada más. No inventes.

FORMATO: respondé en el formato sections+blocks que se especifica más abajo. Cada sección lleva su "key" EXACTO y un "blocks" array (normalmente UN block tipo "text" con el contenido en markdown; podés usar "heading" o "callout" si aporta claridad). NO repitas el label de la sección al inicio del content (la UI ya lo muestra). Máximo ~120 palabras por sección. Bullets con "- " cuando convenga; negrita con **...** para datos clave.`;

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
