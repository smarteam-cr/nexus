/**
 * scripts/seed-timeline-assist-agent.ts
 *
 * Siembra el agente MODIFICADOR del cronograma — id estable `agent-timeline-assist`.
 * Es el que atiende «atrasá Setup una semana» / «agregá las tareas de migración»: recibe el
 * cronograma con ids y devuelve el cronograma completo resultante como PROPUESTA.
 *
 * Hasta el 2026-08-18 su prompt vivía inline en la ruta, así que era el único de los tres
 * agentes de cronograma que no se podía calibrar sin un deploy. Este seed lo sube a la tabla.
 *
 * ⚠ COMPARA ANTES DE PISAR (molde: seed-handoff-agents-por-tipo.ts). Si el prompt vivo difiere
 * del de `lib/agents/timeline-assist.ts` avisa y NO escribe, salvo `--force`. Es la regla del
 * repo: `seed-handoff-agent.ts` escribe incondicionalmente y ya costó calibraciones perdidas.
 *
 * Uso:  npx tsx scripts/seed-timeline-assist-agent.ts [--force]
 */
import { PrismaClient, AgentStatus, AgentType, AgentOutputType, AgentScope } from "@prisma/client";
import { sslParaConexion } from "@/lib/db/ssl";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import {
  ID_ASSIST_CRONOGRAMA,
  GRUPO_ASSIST_CRONOGRAMA,
  NOMBRE_ASSIST_CRONOGRAMA,
  DESCRIPCION_ASSIST_CRONOGRAMA,
  PROMPT_ASSIST_CRONOGRAMA,
} from "@/lib/agents/timeline-assist";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: sslParaConexion(process.env.DATABASE_URL),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const force = process.argv.includes("--force");

  const existing = await prisma.agent.findUnique({
    where: { id: ID_ASSIST_CRONOGRAMA },
    select: { systemPrompt: true, status: true, agentGroup: true },
  });

  if (existing && existing.systemPrompt !== PROMPT_ASSIST_CRONOGRAMA && !force) {
    console.log(`⚠ ${ID_ASSIST_CRONOGRAMA}: el prompt en DB difiere del de este script (¿calibrado a mano?).`);
    console.log(
      `   DB: ${existing.systemPrompt.length} chars · script: ${PROMPT_ASSIST_CRONOGRAMA.length} chars`,
    );
    console.log("   Corré con --force para pisarlo, o editalo en la pantalla de agentes.");
    return;
  }

  const agent = await prisma.agent.upsert({
    where: { id: ID_ASSIST_CRONOGRAMA },
    create: {
      id: ID_ASSIST_CRONOGRAMA,
      name: NOMBRE_ASSIST_CRONOGRAMA,
      description: DESCRIPCION_ASSIST_CRONOGRAMA,
      systemPrompt: PROMPT_ASSIST_CRONOGRAMA,
      /* ⚠ ACTIVE, no el DRAFT del API: la ruta solo usa la fila si está ACTIVE — en DRAFT cae
         al respaldo del módulo y el prompt sembrado no lo lee nadie, sin error y sin log. */
      status: AgentStatus.ACTIVE,
      agentType: AgentType.SECTION,
      outputType: AgentOutputType.CARDS,
      scope: AgentScope.CLIENT,
      /* ⛔ El grupo decide la celda de permiso vía resolveArtifactGate. `cronograma` es el
         que su `switch` declara Y el que la ruta ya pide. Un grupo nuevo lo dejaría corriendo
         sin celda y rompería la biyección grupo↔pieza de lib/pieces/registry.ts. */
      agentGroup: GRUPO_ASSIST_CRONOGRAMA,
      groupOrder: 1,
      associatedStages: [],
    },
    update: {
      name: NOMBRE_ASSIST_CRONOGRAMA,
      description: DESCRIPCION_ASSIST_CRONOGRAMA,
      systemPrompt: PROMPT_ASSIST_CRONOGRAMA,
      agentGroup: GRUPO_ASSIST_CRONOGRAMA,
      status: AgentStatus.ACTIVE,
    },
    select: { id: true, name: true, agentGroup: true, status: true },
  });

  console.log(`✓ ${agent.id} · ${agent.name} · grupo=${agent.agentGroup} · ${agent.status}`);
  console.log(`  prompt: ${PROMPT_ASSIST_CRONOGRAMA.length} chars`);
  if (!existing) console.log("  (fila NUEVA — antes el prompt vivía inline en la ruta)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
