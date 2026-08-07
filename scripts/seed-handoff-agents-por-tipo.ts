/**
 * scripts/seed-handoff-agents-por-tipo.ts
 *
 * Los DOS agentes de handoff que faltaban: uno para **Desarrollo e integración** y uno para
 * **Sitios web**. Comparten `agentGroup: "handoff"` con el de siempre y se distinguen por
 * `Agent.pipelineKey` — el resolver (`lib/agents/resolver.ts`) prefiere el del tipo del
 * proyecto y cae al genérico cuando no hay.
 *
 * ── POR QUÉ EXISTEN ─────────────────────────────────────────────────────────
 * El agente "Handoff Sales→CS" está escrito, línea por línea, para una implementación de
 * HubSpot: rol «Consultor de Customer Success», «ENFOQUE ESTÁNDAR DEL HUB (Sales / Service /
 * CMS / Marketing)», «SEMANA 0 SIEMPRE aunque el cliente ya use HubSpot», y **todo el trabajo
 * técnico comprimido en UNA fase** que corre en paralelo a lo demás. Correr eso sobre un
 * proyecto de desarrollo no produce un plan de desarrollo: produce un plan de adopción de hubs
 * con el desarrollo aplastado adentro. Y como el agente de handoff es también el que escribe
 * las FASES del cronograma, el error no queda en el documento — se propaga al plan de trabajo.
 *
 * ── EL CONTRATO QUE NO SE PUEDE ROMPER ──────────────────────────────────────
 * Los tres prompts producen EL MISMO JSON:
 *   · `sections` con las MISMAS 10 keys (se derivan de HANDOFF_CANVAS acá abajo, no se
 *     transcriben: `reconcileHandoffCanvasSections` corre ANTES DE CADA generación y
 *     renormaliza el canvas contra esa plantilla única, así que una key propia se perdería en
 *     la primera regeneración).
 *   · `timeline.phases` con `durationWeeks` — **si esto falta, el cronograma deja de nacer**,
 *     que es exactamente el bug que la Tanda F vino a arreglar.
 *   · `implementationType`, `isRecurrent`, `tags`.
 * Lo que cambia es el ROL, qué buscar en las fuentes, y de dónde salen las fases.
 *
 * ── LAS FASES SALEN DE LA TABLA, NO DE MI CRITERIO ──────────────────────────
 * HubSpot ya declara la línea de entrega de cada pipeline (Exploración → Requerimientos →
 * Desarrollo → Pruebas → Entrega para desarrollo; Exploración → Mockup → Consenso →
 * Desarrollo → Entrega para sitios web) y Nexus la transcribe en `PROJECT_PIPELINES`. El
 * prompt la interpola desde ahí en vez de repetirla: el día que el portal gane una etapa y
 * alguien la transcriba, el prompt cambia solo y el guard de abajo avisa que hay que re-sembrar.
 *
 * ── EL MOLDE ES EL DEL WATCHDOG, NO EL DEL SEED VIEJO ───────────────────────
 * `scripts/seed-handoff-agent.ts` hace `upsert` escribiendo `systemPrompt` INCONDICIONALMENTE.
 * Replicar eso multiplica el peor modo de falla del repo: una corrida por reflejo borra la
 * calibración que un humano hizo en la pantalla de agentes, sin aviso y sin vuelta atrás.
 * Acá se lee el prompt vivo, se compara, y se AVISA en vez de pisar (`--force` para forzar).
 *
 * Uso: npx tsx scripts/seed-handoff-agents-por-tipo.ts [--force]
 *      (guard: exige ALLOW_PROD_WRITE=1 contra prod)
 */
import { PrismaClient, AgentStatus, AgentOutputType, AgentScope, AgentType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { assertProdWriteAllowed } from "./lib/guard";
import { createScriptPool } from "./lib/db";
import { PROJECT_PIPELINES } from "../lib/projects/kind";
import { AGENTES_HANDOFF_POR_TIPO, KEYS } from "../lib/agents/handoff-por-tipo";

assertProdWriteAllowed("scripts/seed-handoff-agents-por-tipo.ts");
const { pool } = createScriptPool();
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const force = process.argv.includes("--force");

  /* Que la key exista en la tabla no es paranoia: un `pipelineKey` que `PROJECT_PIPELINES` no
     declara hace que el resolver ignore al agente para SIEMPRE. No falla, no loguea — el prompt
     queda escrito y no lo usa nadie. INV15 lo reporta después; esto lo impide antes. */
  const validas = new Set(PROJECT_PIPELINES.map((p) => p.key));
  for (const a of AGENTES_HANDOFF_POR_TIPO) {
    if (!validas.has(a.pipelineKey)) {
      console.error(`✗ "${a.pipelineKey}" no está en PROJECT_PIPELINES. Abortado.`);
      process.exitCode = 1;
      return;
    }
  }

  for (const def of AGENTES_HANDOFF_POR_TIPO) {
    const existing = await prisma.agent.findUnique({
      where: { id: def.id },
      select: { systemPrompt: true, status: true, pipelineKey: true },
    });

    if (existing && existing.systemPrompt !== def.systemPrompt && !force) {
      console.log(`⚠ ${def.id}: el prompt en DB difiere del de este script (¿calibrado a mano?).`);
      console.log(`   DB: ${existing.systemPrompt.length} chars · script: ${def.systemPrompt.length} chars`);
      console.log("   Corré con --force para pisarlo, o editá el prompt directo en la pantalla de agentes.");
      continue;
    }

    const agent = await prisma.agent.upsert({
      where: { id: def.id },
      create: {
        id: def.id,
        name: def.name,
        description: def.description,
        systemPrompt: def.systemPrompt,
        /* ⚠ ACTIVE, no el DRAFT que pone el API por default. `/analyze` filtra por ACTIVE cuando
           arma sus candidatos, así que un agente en DRAFT elegido por el resolver produce el peor
           desenlace: el botón dispara, el endpoint contesta 200 con NO_AGENT_CONFIGURED, y la
           pantalla no muestra ningún error. */
        status: AgentStatus.ACTIVE,
        agentType: AgentType.SECTION,
        outputType: AgentOutputType.CARDS,
        scope: AgentScope.CLIENT,
        agentGroup: "handoff",
        pipelineKey: def.pipelineKey,
        groupOrder: 0,
        // Mismas que el agente base: es el paso 0 de la etapa 1 del flujo.
        associatedStages: [1],
        associatedStep: 0,
        sectionLabel: null,
        // Tiene que ser una key que EXISTA en el canvas de handoff, o el bloque cae en la nada.
        defaultCanvasSection: KEYS[1],
        additionalInstructions: null,
      },
      update: {
        name: def.name,
        description: def.description,
        systemPrompt: def.systemPrompt,
        agentGroup: "handoff",
        pipelineKey: def.pipelineKey,
        defaultCanvasSection: KEYS[1],
        // status / outputType / associatedStages / associatedStep / groupOrder — sin cambios.
      },
      select: { id: true, name: true, pipelineKey: true, status: true, defaultCanvasSection: true },
    });

    console.log(
      `✓ ${agent.id} · "${agent.name}" · pipelineKey=${agent.pipelineKey} · ${agent.status} · ` +
        `sección ${agent.defaultCanvasSection} · prompt ${def.systemPrompt.length} chars`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
