import { prisma } from "../lib/db/prisma";

async function main() {
  // Canvas de proyecto
  const projAgent = await prisma.agent.upsert({
    where: { id: "canvas-project" },
    create: {
      id: "canvas-project",
      name: "Canvas de proyecto",
      description:
        "Extrae información de las cards generadas por otros agentes para actualizar el canvas del proyecto (procesos, dolores, diagnóstico, plan, ejecución).",
      systemPrompt: `Eres un agente que extrae información estructurada de cards de análisis para actualizar el canvas de proyecto.

Secciones del canvas:
- procesos: array de {nombre, flujo_actual, dolores[], owner}
- dolores_oportunidades: {dolor_principal, riesgos[], quick_wins[]}
- diagnostico: {hipotesis[], expectativas[], hallazgos_clave[]}
- plan: {objetivos_piloto[], kpis[], roadmap[]}
- ejecucion: {implementaciones[], metricas_adopcion[], resultados[]}

REGLAS:
- Solo incluye secciones donde las cards tienen información CONCRETA y nueva.
- Para arrays, devuelve el array COMPLETO (no parcial).
- Si el canvas ya tiene contenido, ENRIQUÉCELO, no lo reemplaces con menos info.
- NO inventes información que no esté en las cards.
- Si no hay info relevante para una sección, NO la incluyas.

Responde SOLO con JSON válido con las secciones a actualizar.`,
      status: "ACTIVE",
      agentType: "CANVAS_PROJECT",
      outputType: "CARDS",
      associatedStages: [],
    },
    update: {
      name: "Canvas de proyecto",
      agentType: "CANVAS_PROJECT",
      status: "ACTIVE",
    },
  });

  // Canvas de empresa
  const clientAgent = await prisma.agent.upsert({
    where: { id: "canvas-client" },
    create: {
      id: "canvas-client",
      name: "Canvas de empresa",
      description:
        "Extrae información de las cards para sugerir actualizaciones al canvas de empresa (perfil, stakeholders, madurez, herramientas, contexto comercial).",
      systemPrompt: `Eres un agente que extrae información estructurada de cards de análisis para sugerir actualizaciones al canvas de empresa.

Secciones del canvas:
- perfil: {industria, modelo_negocio, tamano}
- stakeholders: array de {nombre, rol, notas}
- madurez: {marketing, ventas, servicio}
- herramientas: string[]
- contexto_comercial: {canal_adquisicion, relacion_previa, motivacion_compra}

REGLAS:
- Solo incluye secciones donde las cards tienen información CONCRETA y nueva.
- Para arrays, devuelve el array COMPLETO (no parcial).
- Si el canvas ya tiene contenido, ENRIQUÉCELO, no lo reemplaces con menos info.
- NO inventes información que no esté en las cards.
- Si no hay info relevante para una sección, NO la incluyas.
- Las actualizaciones serán SUGERENCIAS que el CSE debe aprobar.

Responde SOLO con JSON válido con las secciones a sugerir.`,
      status: "ACTIVE",
      agentType: "CANVAS_CLIENT",
      outputType: "CARDS",
      associatedStages: [],
    },
    update: {
      name: "Canvas de empresa",
      agentType: "CANVAS_CLIENT",
      status: "ACTIVE",
    },
  });

  console.log("Created:", projAgent.id, clientAgent.id);
  await prisma.$disconnect();
}

main();
