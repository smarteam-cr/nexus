/**
 * scripts/crear-agente-analizador-venta.ts — siembra el agente del analizador de reuniones de venta (S3, 2026-10-25),
 * con id estable `agent-analizador-venta`. El prompt vive en la base para calibrarlo desde /agents sin deploy; el criterio
 * y la verificación de citas viven en código (lib/analizador-venta/).
 *
 * ⚠ Si el prompt de la base difiere del de lib/analizador-venta/prompt.ts (alguien lo editó), NO se pisa sin `--force`.
 * El agente no se despacha por /analyze (está en lib/agents/retirados.ts como «camino propio»): corre solo por
 * lib/analizador-venta/analizar-server.ts.
 *
 *   npx tsx scripts/crear-agente-analizador-venta.ts                       # en seco: dice qué haría
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/crear-agente-analizador-venta.ts --apply [--force]
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { describirDestino, resolverApply } from "./lib/guard";
import { prisma } from "../lib/db/prisma";
import { AGENTE_DEL_ANALIZADOR, PROMPT_DEL_ANALIZADOR } from "../lib/analizador-venta/prompt";

async function main() {
  const escribir = resolverApply({ tablas: ["Agent"] });
  const force = process.argv.includes("--force");
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (${escribir ? "ESCRIBE" : "en seco"})`);
  const existente = await prisma.agent.findUnique({ where: { id: AGENTE_DEL_ANALIZADOR }, select: { systemPrompt: true } });
  if (existente && existente.systemPrompt !== PROMPT_DEL_ANALIZADOR && !force) {
    console.log("⚠ El prompt de la base difiere del de lib/analizador-venta/prompt.ts (¿lo editó alguien en /agents?).");
    console.log(`  Base: ${existente.systemPrompt.length} caracteres · código: ${PROMPT_DEL_ANALIZADOR.length}.`);
    console.log("  No se pisa. Para pisarlo a sabiendas: --force.");
    return;
  }
  if (!escribir) {
    console.log(existente ? "Ya existe con el mismo prompt: no hay nada que hacer." : `Crearía el agente ${AGENTE_DEL_ANALIZADOR}.`);
    return;
  }
  await prisma.agent.upsert({
    where: { id: AGENTE_DEL_ANALIZADOR },
    update: { systemPrompt: PROMPT_DEL_ANALIZADOR, status: "ACTIVE" },
    create: {
      id: AGENTE_DEL_ANALIZADOR,
      name: "Analizador de reuniones de venta",
      description: "Lee una reunión de venta y dice qué tan consultiva fue, con cada juicio citado de la transcripción y dos o tres recomendaciones. Coaching, no evaluación.",
      systemPrompt: PROMPT_DEL_ANALIZADOR,
      status: "ACTIVE",
      agentGroup: "ventas",
      groupOrder: 0,
      associatedStages: [],
    },
  });
  console.log(`✓ ${AGENTE_DEL_ANALIZADOR} listo.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
