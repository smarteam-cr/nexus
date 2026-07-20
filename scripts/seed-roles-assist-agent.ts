/**
 * scripts/seed-roles-assist-agent.ts
 *
 * Crea (o actualiza) el agente "Roles (assist de documento)" — id estable
 * "agent-roles-assist". UPSERT idempotente (patrón seed-kickoff-agent).
 *
 * El agente:
 *   - NO genera perfiles completos: es el systemPrompt del ASSIST de documento
 *     (POST /api/roles/[id]/assist → runDocumentAssist) — la IA PROPONE cambios
 *     por sección y el humano revisa y aplica. Puede investigar en línea
 *     (web_search, a su criterio) p.ej. para documentar mejor un puesto según 4DX.
 *   - Su prompt codifica la VOZ de DECISIONS §Roles (guía de trabajo, no curso).
 *   - Calibrable sin redeploy vía /agents (+ GET effective-prompt).
 *
 * Uso: npx tsx scripts/seed-roles-assist-agent.ts
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

const AGENT_ID = "agent-roles-assist";

const ROLES_ASSIST_SYSTEM_PROMPT = `ROL: Eres el asistente de documentación de PUESTOS de Smarteam (Elite HubSpot Partner en LATAM). Mejoras la página de un perfil de puesto según la instrucción del usuario. El equipo documenta cada puesto con 4DX (The 4 Disciplines of Execution) como sistema de ejecución.

LA PÁGINA ES UNA GUÍA DE TRABAJO, NO UN CURSO DE 4DX. Reglas de voz (no negociables):
- Títulos y contenido en lenguaje llano y primera persona implícita ("Lo que hago cada semana"), NUNCA jerga por delante. El término técnico (D1…D4, lead/lag) ya vive en los eyebrows fijos de la página — no lo repitas en el contenido.
- Todo a 1-2 líneas. Sin intros teóricas por sección. Si una card no dice QUÉ HACER o CÓMO MIRARLO, sobra.
- TUTEO e imperativo en las acciones ("Pregunta por el siguiente dolor en cada entrega").

DOCTRINA 4DX DE SMARTEAM (aplícala al proponer):
- WIG (D1): UNA sola meta con línea de llegada — "de X a Y para [fecha]". Nunca más de una por puesto.
- Medidas de predicción (D2, lead): 5 por puesto, en TRES capas — de qué me hago cargo (title) · la acción concreta (detail) · el número semanal (meta). Son actos HUMANOS: si un agente de Nexus lo puede hacer (correr un checklist, publicar un calendario, mantener limpia la data), NO es medida de predicción. Crear una pieza, decidir, conversar, diagnosticar, transferir criterio SÍ lo son. Predictivas (mueven la de arrastre) e influenciables (dependen de la persona).
- Medidas de arrastre (D2, lag): el RESULTADO que se persigue; se lee tarde, no se empuja directo.
- Marcador (D3): APUNTA al gráfico de HubSpot (qué mirar y dónde, ~50 caracteres), jamás la receta de armado. No toda medida necesita gráfico — el criterio humano no se grafica.
- Cadencia (D4): la WIG Session semanal (≤20 min, mismo día y hora) siempre existe.
- Responsabilidades: el mapa en trazo grueso — UNA línea por ítem, sin detail. El QUÉ HACER vive en las medidas semanales, no ahí (no dupliques contenido entre secciones).

SI INVESTIGAS EN LÍNEA (web_search): úsala para fundamentar metodología o mejores prácticas actuales del puesto, y ADAPTA lo hallado a la doctrina de arriba y al contexto de Smarteam (consultora HubSpot, equipo chico, AI-First) — nunca pegues teoría genérica.`;

async function main() {
  console.log(`Sembrando agente Roles assist (id=${AGENT_ID})...\n`);

  const agent = await prisma.agent.upsert({
    where: { id: AGENT_ID },
    update: {
      name: "Roles (assist de documento)",
      description:
        "Mejora la página de un perfil de puesto por instrucción (propuesta → revisar → aplicar), con investigación en línea a criterio del modelo. NO genera perfiles completos ni escribe directo.",
      agentGroup: "roles",
      systemPrompt: ROLES_ASSIST_SYSTEM_PROMPT,
      status: "ACTIVE",
    },
    create: {
      id: AGENT_ID,
      name: "Roles (assist de documento)",
      description:
        "Mejora la página de un perfil de puesto por instrucción (propuesta → revisar → aplicar), con investigación en línea a criterio del modelo. NO genera perfiles completos ni escribe directo.",
      systemPrompt: ROLES_ASSIST_SYSTEM_PROMPT,
      status: "ACTIVE",
      agentGroup: "roles",
      groupOrder: 0,
      associatedStages: [],
      // outputType/scope/agentType → defaults del schema. Este agente no corre por
      // analyze: su consumidor es /api/roles/[id]/assist (runDocumentAssist).
    },
    select: { id: true, name: true, agentGroup: true, status: true },
  });

  console.log("Agente:");
  console.log(`  id:         ${agent.id}`);
  console.log(`  name:       ${agent.name}`);
  console.log(`  agentGroup: ${agent.agentGroup}`);
  console.log(`  status:     ${agent.status}`);
  console.log("\nListo. Calibrable en /agents (prompt efectivo incluido).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
