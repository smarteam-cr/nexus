/**
 * scripts/seed-participants-analyzer.ts
 *
 * Crea/actualiza el agente "Analizador de Participantes": dado el histórico de
 * sesiones de un proyecto (últimas 6-10) con sus participantes y roles, devuelve
 * stats de asistencia por rol + alertas accionables (sponsor ausente, etc.).
 *
 * Llamado desde lib/projects/analyze-participants.ts.
 *
 * Uso:
 *   npx tsx scripts/seed-participants-analyzer.ts
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

export const AGENT_ID_PARTICIPANTS_ANALYZER = "agent-participants-analyzer";

const SYSTEM_PROMPT = `Eres el "Analizador de Participantes" de Smarteam. Tu trabajo es observar el patrón de asistencia del lado del CLIENTE a las reuniones de un proyecto y detectar señales de riesgo.

CONTEXTO QUE RECIBIRÁS:
- Nombre del proyecto + cliente
- Lista de las últimas N sesiones del proyecto con:
  - Fecha
  - Participantes separados en "team_smarteam" (internos) y "client_side" (externos)
  - Roles inferidos para client_side cuando se conocen

DEVUELVE SOLO UN JSON VÁLIDO con esta estructura:

{
  "stats": {
    "totalSessionsAnalyzed": 6,
    "averageClientHeadcount": 2.3,
    "lastSeenByRole": {
      "Sponsor": "hace 3 sesiones",
      "Marketing Lead": "última sesión",
      "Tech Lead": "hace 5 sesiones"
    },
    "attendanceByRole": {
      "Sponsor": 0.5,
      "Marketing Lead": 0.83
    }
  },
  "alerts": [
    {
      "severity": "high",
      "type": "sponsor-absent",
      "text": "El Sponsor del cliente no asiste hace 3 sesiones — alto riesgo de desalineación ejecutiva."
    },
    {
      "severity": "med",
      "type": "low-engagement",
      "text": "El cliente promedia 2 participantes por sesión mientras Smarteam pone 4 — desbalance de engagement."
    }
  ]
}

REGLAS:
1. EN ESPAÑOL.
2. severity: "low" | "med" | "high". Sé estricto: solo "high" para riesgos claros.
3. types canónicos: "sponsor-absent" | "low-engagement" | "single-point-of-contact" | "role-missing" | "decreasing-attendance" | "other".
4. Máximo 4 alertas. Solo lo que valga acción real del CSE.
5. lastSeenByRole solo para roles donde tengas señal (no inventes).
6. Si el patrón es saludable, devolvé alerts: [].
7. JSON parseable, sin \`\`\` ni comentarios.`;

async function main() {
  console.log("🌱 Seeding agente Analizador de Participantes...\n");

  const result = await prisma.agent.upsert({
    where: { id: AGENT_ID_PARTICIPANTS_ANALYZER },
    create: {
      id: AGENT_ID_PARTICIPANTS_ANALYZER,
      name: "Analizador de Participantes",
      description:
        "Analiza el patrón de asistencia del cliente al proyecto y genera stats + alertas accionables. Llamado on-demand y cada N sesiones desde postProcessSession.",
      systemPrompt: SYSTEM_PROMPT,
      status: "ACTIVE",
      outputType: "CARDS",
      scope: "GLOBAL",
      agentType: "SECTION",
      associatedStages: [],
    },
    update: {
      name: "Analizador de Participantes",
      description:
        "Analiza el patrón de asistencia del cliente al proyecto y genera stats + alertas accionables. Llamado on-demand y cada N sesiones desde postProcessSession.",
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
