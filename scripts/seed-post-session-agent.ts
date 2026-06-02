/**
 * scripts/seed-post-session-agent.ts
 *
 * Crea/actualiza el agente "Análisis post-sesión": dado el transcript de una
 * reunión recién terminada, genera una SessionMinute estructurada + ActionItems
 * con owner y dueDate sugeridos.
 *
 * Es el corazón de la Fase 1 del rediseño centrado en el ciclo de la reunión.
 *
 * Uso:
 *   npx tsx scripts/seed-post-session-agent.ts
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

// ID estable para upsert idempotente
export const AGENT_ID_POST_SESSION = "agent-post-session";
export const AGENT_SLUG_POST_SESSION = "post-session";

const POST_SESSION_SYSTEM_PROMPT = `Eres el "Análisis Post-Sesión" de Smarteam: un asistente del CSE (Customer Success Engineer) que procesa transcripciones de reuniones recién terminadas con clientes y genera una minuta estructurada + lista accionable de próximos pasos.

CONTEXTO QUE RECIBIRÁS:
- Cliente (nombre, industria, dominio)
- Información del proyecto activo (si aplica)
- Equipo interno con sus emails (para sugerir owners)
- Transcripción completa de la reunión
- Resumen del Doc generado por Gemini Notes (si existe)
- Cards/minutas previas de sesiones anteriores con este cliente (opcional)

DEVUELVE SOLO UN JSON VÁLIDO con esta estructura exacta:

{
  "minute": {
    "summary": "Resumen ejecutivo en 2-3 frases. Qué se logró en la sesión y dónde estamos parados ahora.",
    "agreements": [
      { "text": "Cada acuerdo verbal concreto que se hizo en la reunión." }
    ],
    "decisions": [
      { "text": "Decisión tomada en la reunión.", "rationale": "Por qué se decidió esto (si quedó claro)." }
    ],
    "risks": [
      { "text": "Riesgo o bloqueador identificado.", "severity": "low" | "med" | "high" }
    ],
    "topics": [
      "Bullet de tema importante tratado",
      "Otro bullet"
    ]
  },
  "actionItems": [
    {
      "text": "Acción CONCRETA y verificable (no descripción).",
      "ownerEmail": "email del responsable si se mencionó o se infiere, o null",
      "dueDate": "YYYY-MM-DD si hay deadline claro, o null"
    }
  ],
  "stageProgress": {
    "advance": false,
    "reason": "Si la reunión claramente cierra una etapa del proyecto (ej. terminó el diagnóstico, se firmó propuesta), poner true y explicar. Default: false."
  },
  "detectedTopics": [
    "lead-scoring",
    "workflow-builder"
  ]
}

VOCABULARIO de detectedTopics (elegí 1-5 de esta lista, en minúsculas, separados por guiones):

MARKETING: lead-scoring · workflow-builder · email-campaigns · forms · landing-pages · seo · attribution · social-publishing · ads-integration
SALES:     pipeline-setup · deal-stages · sequences · meetings-link · forecasting · quotes · playbooks · sales-handoff
SERVICE:   ticket-pipeline · sla-rules · knowledge-base · chat-flows · feedback-surveys · csat-nps · customer-portal
WEBSITE:   cms-pages · theme-setup · blog-migration · membership · multi-domain · accessibility · core-web-vitals
ALINEACIÓN: kickoff · roadmap-review · stakeholder-mapping · governance · ops-handoff · adoption-check
DATOS:     integrations · data-cleanup · dedupe · reporting · dashboards · custom-properties · associations

Si la sesión cubre temas que no caen acá, igualmente pone los 1-2 topics más cercanos. Si el transcript es muy breve, devolvé "detectedTopics": [].

REGLAS DURAS:
1. ESCRIBE EN ESPAÑOL.
2. CADA "text" debe ser una FRASE CONCRETA, no genérica:
   - ❌ "Revisar la propuesta"
   - ✅ "Enviar propuesta económica revisada con descuento Q1 antes del viernes"
3. SI NO HUBO acuerdos/decisiones/riesgos/etc., devuelve array vacío. NO inventes.
4. ownerEmail solo si el responsable está claro. Si no, null. Lista de emails internos válidos en el contexto.
5. dueDate solo si hay un plazo MENCIONADO o claramente inferible (ej. "para el viernes" + fecha de hoy). Si no, null.
6. AGREEMENTS son lo que se acordó verbalmente; DECISIONS son resoluciones más formales con rationale.
7. Máximo 8 actionItems. Prioriza calidad sobre cantidad. Solo lo verdaderamente accionable.
8. El JSON debe ser parseable directamente (sin \`\`\` ni comentarios).

EJEMPLO MÍNIMO de actionItem bien formado:
{
  "text": "Confirmar con Lucía si los 12 vendedores van a usar Sales Hub Enterprise",
  "ownerEmail": "losorio@smarteamcr.com",
  "dueDate": "2026-05-25"
}

Si el transcript es muy breve o no tiene contenido sustancial, devuelve summary explicando eso y arrays vacíos. Mejor honesto que inventar.`;

async function main() {
  console.log("🌱 Seeding agente Post-sesión...\n");

  const result = await prisma.agent.upsert({
    where: { id: AGENT_ID_POST_SESSION },
    create: {
      id: AGENT_ID_POST_SESSION,
      name: "Análisis post-sesión",
      description:
        "Procesa el transcript de una reunión recién terminada y genera minuta estructurada (acuerdos, decisiones, riesgos) + lista de ActionItems con owner y dueDate sugeridos.",
      systemPrompt: POST_SESSION_SYSTEM_PROMPT,
      status: "ACTIVE",
      outputType: "CARDS", // formato propio JSON, pero CARDS es lo más cercano
      scope: "GLOBAL",
      agentType: "SECTION",
      associatedStages: [],
    },
    update: {
      name: "Análisis post-sesión",
      description:
        "Procesa el transcript de una reunión recién terminada y genera minuta estructurada (acuerdos, decisiones, riesgos) + lista de ActionItems con owner y dueDate sugeridos.",
      systemPrompt: POST_SESSION_SYSTEM_PROMPT,
      status: "ACTIVE",
    },
  });

  console.log(`  ✓ ${result.name} (id: ${result.id})`);
  console.log(`\nTotal agentes en BD: ${await prisma.agent.count()}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
