import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Instrucción que se agrega a TODOS los agentes de sección
const CANVAS_INSTRUCTION = `

INSTRUCCIÓN DE CANVAS (OBLIGATORIA):
Cada card que generes DEBE incluir un campo "canvasSection" que indica a qué sección del canvas de proyecto corresponde.
Las secciones disponibles son:
- "objetivo_alcance" — Para objetivos, metas, alcance, perfil estratégico, qué se vendió
- "hipotesis_recomendaciones" — Para hipótesis de trabajo, preguntas, hallazgos, brechas, diagnóstico
- "procesos" — Para procesos identificados, mapeos, flujos, rutinas
- "plan_implementacion" — Para planes, cronogramas, próximos pasos, agendas

Si el título del card encaja claramente en una sección, asígnala. Si no encaja en ninguna, usa null.

Ejemplo de formato:
{
  "cards": [
    { "title": "Perfil Estratégico", "content": "...", "canvasSection": "objetivo_alcance" },
    { "title": "Hipótesis de Trabajo", "content": "...", "canvasSection": "hipotesis_recomendaciones" },
    { "title": "Procesos Clave", "content": "...", "canvasSection": "procesos" }
  ]
}`;

// Mapeo de agentes a sus secciones default por card
const AGENT_SECTION_MAPPINGS: Record<string, Record<string, string>> = {
  // Análisis inicial — 9 cards
  "cmmla1g1x00005wijix3qnr7u": {
    "default": "objetivo_alcance",
  },
  // Preparación para el Kick-off — 5 cards
  "cmmwxty5k0000u0ijzf2hkqx2": {
    "Perfil Estratégico y Metas": "objetivo_alcance",
    "Mapeo de Rendimiento": "hipotesis_recomendaciones",
    "Dolores y Fricciones Críticos": "hipotesis_recomendaciones",
    "Hipótesis de Trabajo": "hipotesis_recomendaciones",
    "Preguntas para el Kick-off": "hipotesis_recomendaciones",
  },
  // Mapeo inicial de procesos
  "agent-mapeo-inicial": {
    "default": "procesos",
  },
  // Preparación de entrevistas
  "agent-entrevistas-prep": {
    "Mapa de entrevistados": "objetivo_alcance",
    "Hipótesis a validar": "hipotesis_recomendaciones",
    "Áreas de profundización": "hipotesis_recomendaciones",
    "Agenda sugerida de sesiones": "plan_implementacion",
    "Puntos de atención y sensibilidades": "hipotesis_recomendaciones",
    "default": "hipotesis_recomendaciones",
  },
  // Informe de diagnóstico de marketing
  "agent-diagnostico-marketing": {
    "Análisis del Funnel de Marketing": "hipotesis_recomendaciones",
    "KPIs Actuales de Marketing": "hipotesis_recomendaciones",
    "Disponibilidad y Accesibilidad de Data de Marketing": "hipotesis_recomendaciones",
    "Proceso de Marketing (Diseño Teórico)": "procesos",
    "Rutina Real de Marketing (Lo que realmente pasa)": "procesos",
    "Roles y Estructura de Marketing": "objetivo_alcance",
    "Brechas de Marketing": "hipotesis_recomendaciones",
    "Diagnóstico y Escala de Rendimiento": "hipotesis_recomendaciones",
  },
};

async function main() {
  // 1. Agregar instrucción de canvas a todos los agentes de sección activos
  const agents = await prisma.agent.findMany({
    where: { agentType: "SECTION", status: "ACTIVE" },
    select: { id: true, name: true, systemPrompt: true, additionalInstructions: true },
  });

  for (const agent of agents) {
    // Si ya tiene la instrucción, skip
    if (agent.systemPrompt.includes("INSTRUCCIÓN DE CANVAS")) {
      console.log(`⏭ ${agent.name} — ya tiene instrucción de canvas`);
      continue;
    }

    // Agregar la instrucción al final del systemPrompt
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        systemPrompt: agent.systemPrompt + CANVAS_INSTRUCTION,
        // Guardar el mapping de secciones en el campo defaultCanvasSection
        defaultCanvasSection: AGENT_SECTION_MAPPINGS[agent.id]?.["default"] ?? "hipotesis_recomendaciones",
      },
    });
    console.log(`✓ ${agent.name} — instrucción de canvas agregada, default: ${AGENT_SECTION_MAPPINGS[agent.id]?.["default"] ?? "hipotesis_recomendaciones"}`);
  }

  // 2. Eliminar el agente borrador "Agente de Kickoff" (wildcard peligroso)
  const deleted = await prisma.agent.deleteMany({
    where: { name: "Agente de Kickoff", status: "DRAFT" },
  });
  if (deleted.count > 0) {
    console.log(`🗑 Eliminado "Agente de Kickoff" (borrador wildcard)`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
