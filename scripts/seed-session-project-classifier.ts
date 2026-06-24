/**
 * scripts/seed-session-project-classifier.ts
 *
 * Crea/actualiza el agente "Clasificador sesión→proyecto": dado el título,
 * transcript y participantes de una sesión, y la lista de proyectos activos
 * del cliente, propone a qué proyecto(s) pertenece (N:N con uno primario).
 *
 * Usado por lib/sessions/post-process.ts ANTES de generar minute/actions para
 * saber a qué proyecto vincularlos.
 *
 * Uso:
 *   npx tsx scripts/seed-session-project-classifier.ts
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

export const AGENT_ID_SESSION_PROJECT_CLASSIFIER = "agent-session-project-classifier";

const SYSTEM_PROMPT = `Eres el "Clasificador Sesión→Proyecto" de Smarteam. Tu trabajo es decidir a qué proyecto(s) del cliente pertenece una reunión.

Smarteam implementa HubSpot para clientes. Cada cliente puede tener múltiples proyectos paralelos (ej: "Implementación Marketing Hub", "Implementación Sales Hub", "Onboarding Service Hub"). Una reunión normalmente toca UN proyecto, pero a veces cubre varios (reuniones de alineación general, kickoffs combinados, etc.).

CONTEXTO QUE RECIBIRÁS:
- Cliente (nombre, dominio)
- Título de la reunión
- Participantes (emails + roles inferidos)
- Transcript completo (puede estar truncado a 30K chars)
- Lista de proyectos activos del cliente con: id, name, serviceType (loop_marketing | loop_sales | loop_service | proyecto_temporal), currentStage, fecha de creación del proyecto y fecha de cierre del deal ancla (cuando existe)

DEVUELVE SOLO UN JSON VÁLIDO con esta estructura exacta:

{
  "assignments": [
    {
      "projectId": "id-del-proyecto",
      "isPrimary": true,
      "confidence": 0.92,
      "rationale": "Frase corta: por qué este proyecto matchea."
    },
    {
      "projectId": "otro-id",
      "isPrimary": false,
      "confidence": 0.55,
      "rationale": "..."
    }
  ]
}

REGLAS:
1. EXACTAMENTE UN proyecto debe tener isPrimary=true. Es el "principal" donde se mostrará la minuta y las acciones por defecto.
2. Si la reunión claramente toca varios proyectos, agregar más assignments con isPrimary=false (máximo 3 secundarios).
3. confidence: 0.0-1.0. Solo asignar proyectos con confidence >= 0.4. Si dudas, mejor menos asignaciones.
4. rationale en ESPAÑOL, máximo 1 frase corta. Justifica con señales concretas del título/transcript ("se habló de Workflows", "participó la PM de marketing", etc.).
5. Si NINGÚN proyecto matchea con confidence >= 0.4, devuelve { "assignments": [] }.
6. Si el cliente tiene solo 1 proyecto activo, asignárselo con isPrimary=true y confidence basada en cuán claro está el match.
7. El JSON debe ser parseable directamente (sin \`\`\` ni comentarios).

CRITERIOS DE MATCHING (en orden de peso):
- Tema principal del transcript (workflows, lead scoring, deals, tickets, etc.) vs serviceType del proyecto.
- Título de la reunión menciona el módulo (ej. "Marketing Hub - Implementación" → loop_marketing).
- Participantes: si el owner del proyecto está, +confidence; si responsables del área están, +confidence.
- Stage del proyecto vs lo que se hizo en la sesión (ej. kickoff vs adopción).
- FECHAS (desempate CLAVE cuando dos proyectos comparten serviceType o son secuenciales): cruzá la fecha de la reunión con la ventana temporal de cada proyecto (creación del proyecto y cierre del deal ancla). Una reunión de venta/descubrimiento suele caer ANTES o cerca del cierre del deal de ESE proyecto; una de implementación cae DESPUÉS de la creación del proyecto. Ante dos proyectos del mismo tipo, la reunión pertenece al que tiene su ventana (creación↔cierre) más cercana a la fecha de la reunión. NO mezcles proyectos secuenciales: citá la fecha en el rationale cuando la uses para desempatar.`;

async function main() {
  console.log("🌱 Seeding agente Clasificador sesión→proyecto...\n");

  const result = await prisma.agent.upsert({
    where: { id: AGENT_ID_SESSION_PROJECT_CLASSIFIER },
    create: {
      id: AGENT_ID_SESSION_PROJECT_CLASSIFIER,
      name: "Clasificador sesión→proyecto",
      description:
        "Decide a qué proyecto(s) del cliente pertenece una reunión. Devuelve assignments con isPrimary y confidence. Llamado desde postProcessSession.",
      systemPrompt: SYSTEM_PROMPT,
      status: "ACTIVE",
      outputType: "CARDS",
      scope: "GLOBAL",
      agentType: "SECTION",
      associatedStages: [],
    },
    update: {
      name: "Clasificador sesión→proyecto",
      description:
        "Decide a qué proyecto(s) del cliente pertenece una reunión. Devuelve assignments con isPrimary y confidence. Llamado desde postProcessSession.",
      systemPrompt: SYSTEM_PROMPT,
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
