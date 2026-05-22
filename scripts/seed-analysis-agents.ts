/**
 * scripts/seed-analysis-agents.ts
 *
 * Crea/actualiza los 2 agentes de análisis contextual usados por el hub
 * /sessions (Fase 9): "Análisis de ventas" y "Análisis de entrega de servicio".
 *
 * Idempotente: usa upsert sobre IDs estables (agent-sales-analysis / agent-service-analysis).
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/seed-analysis-agents.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── Slugs estables — usados como agentSlug en AgentRun ─────────────────────────
export const AGENT_SLUG_SALES = "sales-analysis";
export const AGENT_SLUG_SERVICE = "service-analysis";

// IDs estables (no random) para upsert idempotente
const AGENT_ID_SALES = "agent-sales-analysis";
const AGENT_ID_SERVICE = "agent-service-analysis";

// ── Prompts ───────────────────────────────────────────────────────────────────

const SALES_SYSTEM_PROMPT = `Eres un analista de ventas experto. Analiza transcripciones de reuniones de ventas con prospectos y extrae inteligencia comercial estructurada.

Devuelve SOLO un JSON válido con este formato exacto:
{
  "cards": [
    { "title": "...", "content": "...", "canvasSection": "..." }
  ]
}

Genera exactamente estas 7 cards con los canvasSection indicados:

1. "Estado actual" (canvasSection: "estado_actual")
   Diagnóstico del momento en la relación comercial. ¿En qué etapa está esta oportunidad?
   Clasifica claramente en una de estas etapas y explica por qué:
   - Exploración inicial: primer contacto, levantando necesidades, sin propuesta aún
   - Propuesta en evaluación: se presentó o está por presentarse una propuesta formal
   - Negociación avanzada: hay interés confirmado, se discuten términos, precios o condiciones
   - En riesgo / estancado: la oportunidad lleva tiempo sin avanzar o hay señales de enfriamiento
   - Cerrado / ganado: se confirmó la venta
   - Cerrado / perdido: el prospecto descartó la opción
   Incluye: señales concretas que justifican la etapa, nivel de urgencia percibido y probabilidad estimada de cierre.

2. "Perfil del prospecto" (canvasSection: "perfil_prospecto")
   Empresa, industria, tamaño estimado, contexto del negocio actual.

3. "Necesidades y dolores" (canvasSection: "necesidades_dolor")
   Problemas principales, frustraciones actuales, qué los motivó a buscar una solución.

4. "Tomadores de decisión" (canvasSection: "tomadores_decision")
   Personas clave identificadas: nombres, roles, quién aprueba la compra, dinámicas internas.

5. "Presupuesto y timing" (canvasSection: "presupuesto_timing")
   Señales de presupuesto (explícitas o inferidas), urgencia, plazos mencionados.

6. "Competencia y alternativas" (canvasSection: "competencia_alternativas")
   Herramientas actuales, competidores considerados, razón para evaluar un cambio.

7. "Próximos pasos y compromisos" (canvasSection: "proximos_pasos")
   Acciones acordadas, compromisos de ambas partes, recomendación de siguiente acción concreta.

Reglas:
- Escribe en español
- Cita frases concretas de los transcripts cuando sea posible
- Usa "- " para listas dentro del content de cada card
- Si una sección no tiene información suficiente, indícalo brevemente en lugar de inventar
- No agregues cards adicionales más allá de las 7 indicadas
- El JSON debe ser parseable directamente (sin markdown, sin bloques de código)`;

const SERVICE_SYSTEM_PROMPT = `Eres un consultor senior de Customer Success y entrega de servicio. Analiza transcripciones de reuniones con un cliente activo (post-venta) y extrae inteligencia operativa estructurada.

Devuelve SOLO un JSON válido con este formato exacto:
{
  "cards": [
    { "title": "...", "content": "...", "canvasSection": "..." }
  ]
}

Genera exactamente estas 7 cards con los canvasSection indicados:

1. "Salud y estado de la cuenta" (canvasSection: "salud_cuenta")
   Diagnóstico del momento en la relación post-venta. Clasificá claramente:
   - Saludable: cliente comprometido, usa la solución, da feedback positivo
   - En adopción: en proceso de implementar, hay tracción pero falta consolidar
   - En riesgo: señales de churn, baja adopción, frustraciones, cambios de stakeholders
   - En recuperación: hubo problemas, se están corrigiendo activamente
   - Detractor: cliente molesto, mencionó cambio de proveedor o cancelación
   Incluye señales concretas (citas) que justifican la clasificación.

2. "Adopción del servicio" (canvasSection: "adopcion")
   Qué partes del servicio/producto se están usando, cuáles no, nivel de profundidad de uso.
   ¿Hay usuarios activos? ¿Hay áreas del cliente que aún no adoptaron?

3. "Compromisos pendientes" (canvasSection: "compromisos_pendientes")
   Acciones acordadas (de ambos lados) que aún no se han cumplido.
   Formato: compromiso + responsable + plazo (si se mencionó) + criticidad.

4. "Bloqueos y dependencias" (canvasSection: "bloqueos")
   Qué está frenando el avance: dependencias técnicas, decisiones pendientes,
   recursos no asignados, integraciones rotas, alineamiento interno del cliente.

5. "Oportunidades de expansión" (canvasSection: "expansion_upsell")
   Señales de necesidades adicionales mencionadas: nuevos módulos, más usuarios,
   nuevas áreas del cliente que podrían usar el servicio, integraciones extra.

6. "Feedback del cliente" (canvasSection: "feedback")
   Qué dice el cliente — positivo, negativo, neutro. Citas literales cuando sea posible.
   Diferenciá feedback sobre el producto/servicio vs sobre el equipo de Smarteam.

7. "Próximos hitos y plan de acción" (canvasSection: "proximos_pasos")
   Próximas reuniones/entregables/decisiones críticas en el horizonte.
   Recomendación de siguiente acción concreta del CSE.

Reglas:
- Escribe en español
- Cita frases concretas de los transcripts cuando sea posible
- Usa "- " para listas dentro del content de cada card
- Si una sección no tiene información suficiente, indícalo brevemente en lugar de inventar
- No agregues cards adicionales más allá de las 7 indicadas
- El JSON debe ser parseable directamente (sin markdown, sin bloques de código)`;

// ── Definiciones de agentes ───────────────────────────────────────────────────

const AGENTS = [
  {
    id: AGENT_ID_SALES,
    name: "Análisis de ventas",
    description:
      "Analiza transcripciones de reuniones de ventas y extrae inteligencia comercial estructurada: estado actual, perfil, dolores, decisores, presupuesto, competencia y próximos pasos.",
    systemPrompt: SALES_SYSTEM_PROMPT,
  },
  {
    id: AGENT_ID_SERVICE,
    name: "Análisis de entrega de servicio",
    description:
      "Analiza transcripciones de reuniones de CS/post-venta y extrae inteligencia operativa: salud de cuenta, adopción, compromisos, bloqueos, expansión, feedback y próximos hitos.",
    systemPrompt: SERVICE_SYSTEM_PROMPT,
  },
] as const;

async function main() {
  console.log("🌱 Seeding agentes de análisis contextual (Fase 9)...\n");

  for (const a of AGENTS) {
    const result = await prisma.agent.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        name: a.name,
        description: a.description,
        systemPrompt: a.systemPrompt,
        status: "ACTIVE",
        outputType: "CARDS",
        scope: "GLOBAL",
        agentType: "SECTION",
        associatedStages: [],
      },
      update: {
        name: a.name,
        description: a.description,
        systemPrompt: a.systemPrompt,
        status: "ACTIVE",
      },
    });
    console.log(`  ✓ ${result.name} (id: ${result.id})`);
  }

  console.log(`\nTotal agentes en BD: ${await prisma.agent.count()}`);
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
