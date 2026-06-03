import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// System prompt para el agente "Información del cliente". Las secciones que
// puede poblar coinciden 1:1 con las CanvasSection.key del Project __strategy__
// (ahora renombrado a "Información del cliente").
const CLIENT_INFO_SYSTEM_PROMPT = `Eres un agente que extrae información estructurada de cards de análisis para sugerir actualizaciones al panel "Información del cliente".

El panel tiene 3 secciones editables. Cada sección corresponde a un CanvasSection.key específico:

- stakeholders (key="stakeholders"): array de {nombre, rol, notas}
  Personas del lado del cliente con quien Smarteam interactúa: Sponsor, Marketing Lead, Tech Lead, etc.
  Notas incluyen: nivel de involucramiento, preocupaciones expresadas, peso en decisiones.

- retos_estrategicos (key="retos_estrategicos"): array de {descripcion, estado, fuente}
  Problemas o bloqueos importantes que el cliente enfrenta y que el proyecto debe atacar.
  estado: "validado" si fue mencionado por el cliente o confirmado en una reunión; "por_validar" si es hipótesis del CSE.
  fuente: de dónde sale (ej. "Hand Off | 18-may", "Email del Sponsor", "card-id-X").

- oportunidades (key="oportunidades"): array de {descripcion, hub, escala_nivel, estado}
  Posibles ampliaciones del proyecto: nuevas funcionalidades, hubs adicionales, expansión de uso.
  hub: marketing / sales / service / cms / operations.
  escala_nivel: 0-4 (nivel de madurez objetivo).
  estado: "identificada" | "propuesta" | "aceptada" | "descartada".

REGLAS:
- Solo incluye secciones donde las cards tienen información CONCRETA y nueva.
- Para arrays, devuelve el array COMPLETO (no parcial).
- Si la sección ya tiene contenido, ENRIQUÉCELO, no lo reemplaces con menos info.
- NO inventes información que no esté en las cards.
- Si no hay info relevante para una sección, NO la incluyas en el output.
- Las actualizaciones serán SUGERENCIAS que el CSE debe aprobar antes de persistirse.

Responde SOLO con JSON válido con las secciones a sugerir, usando los keys exactos:

{
  "stakeholders": [ {"nombre": "...", "rol": "...", "notas": "..."} ],
  "retos_estrategicos": [ {"descripcion": "...", "estado": "validado", "fuente": "..."} ],
  "oportunidades": [ {"descripcion": "...", "hub": "marketing", "escala_nivel": 2, "estado": "identificada"} ]
}

Si no hay nada que sugerir para ninguna sección, devuelve {}.`;

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

  // Información del cliente (ex Canvas de empresa / Canvas de estrategia)
  //
  // Antes apuntaba a 5 secciones (perfil, stakeholders, madurez, herramientas,
  // contexto_comercial). En la migración a "Información del cliente" reducimos
  // el scope a las 3 secciones que sobrevivieron: stakeholders, retos_estrategicos
  // y oportunidades. Los keys CanvasSection son los que el agente debe poblar.
  const clientAgent = await prisma.agent.upsert({
    where: { id: "canvas-client" },
    create: {
      id: "canvas-client",
      name: "Información del cliente",
      description:
        "Extrae información de las cards generadas por otros agentes para sugerir actualizaciones a las 3 secciones del panel 'Información del cliente': stakeholders, retos estratégicos y oportunidades.",
      systemPrompt: CLIENT_INFO_SYSTEM_PROMPT,
      status: "ACTIVE",
      agentType: "CANVAS_CLIENT",
      outputType: "CARDS",
      associatedStages: [],
    },
    update: {
      name: "Información del cliente",
      description:
        "Extrae información de las cards generadas por otros agentes para sugerir actualizaciones a las 3 secciones del panel 'Información del cliente': stakeholders, retos estratégicos y oportunidades.",
      systemPrompt: CLIENT_INFO_SYSTEM_PROMPT,
      agentType: "CANVAS_CLIENT",
      status: "ACTIVE",
    },
  });

  console.log("Created:", projAgent.id, clientAgent.id);
  await prisma.$disconnect();
}

main();
