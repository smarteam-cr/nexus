/**
 * scripts/congelar-handoffs-aplicados.ts — CONGELAR LOS HANDOFFS QUE YA TENÍAN SU CRONOGRAMA (etapa 3b).
 *
 * Desde la etapa 3b el handoff se congela solo la primera vez que se aplica el cronograma que propone
 * (app/api/projects/[projectId]/timeline/borrador/aplicar). Esa regla no cubre los handoffs anteriores. Este
 * script los lista y, solo si Elías lo decide, los congela con la vía «migración» (DECISIONS «El handoff se
 * congela»). Wherex queda fuera siempre (hizo churn y es el cliente de prueba de Nexus).
 *
 * Dos grupos, y el segundo solo entra si se pide:
 *   A · el cronograma tiene aplicada una propuesta del handoff (el historial del cronograma lo dice:
 *       «Propuesta de fases del handoff aplicada: N de …» o, antes de E4, «Sugerencias del handoff aceptadas…»,
 *       con algo aplicado). Es la misma regla que corre hoy al aplicar.
 *   B · el cronograma lo creó el handoff directo, sin propuesta (la primera generación de un proyecto sin
 *       cronograma: `ProjectTimeline.generatedByAgentRunId` es una corrida del handoff). Hoy esa creación NO
 *       congela sola; por eso este grupo va aparte, con `--tambien-creados`.
 *
 * Congelar es lo mismo que el botón: una foto protegida del documento (`VersionDeDocumento.protegida`) y el hito
 * «congelado» en su canvas (`HitoDeDocumento`). No borra ni reescribe nada del handoff. Un handoff vacío o ya
 * congelado se saltea.
 *
 *   npx tsx scripts/congelar-handoffs-aplicados.ts                                  # simulacro: cuántos y cuáles
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/congelar-handoffs-aplicados.ts --apply       # congela el grupo A
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/congelar-handoffs-aplicados.ts --apply --tambien-creados   # A y B
 *
 * En PowerShell: `$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/congelar-handoffs-aplicados.ts --apply`.
 * Con `--apply` se respaldan antes `HitoDeDocumento` y `VersionDeDocumento` (pg_dump; sin pg_dump, el guard frena).
 * Correrlo dos veces no cambia nada la segunda: lo ya congelado se saltea.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { congelarHandoff, leerCongelado } from "@/lib/handoff/congelado-server";
import { razonDeHandoffAplicado } from "@/lib/handoff/congelado";

const APPLY = resolverApply({ tablas: ["HitoDeDocumento", "VersionDeDocumento"] });
const TAMBIEN_CREADOS = process.argv.includes("--tambien-creados");
/** Wherex queda fuera siempre. */
const EXCLUIDOS_POR_NOMBRE = /wherex/i;

type Grupo = "A" | "B";

async function main() {
  imprimirDestino();
  console.log(
    `${APPLY ? "APLICANDO" : "Simulacro (nada se escribe)"} · grupo A${TAMBIEN_CREADOS ? " y grupo B" : " (el B solo con --tambien-creados)"}\n`,
  );

  const proyectos = await prisma.project.findMany({
    where: { handoffGeneratedAt: { not: null } },
    select: {
      id: true,
      name: true,
      handoffGeneratedAt: true,
      client: { select: { name: true } },
      canvases: { where: canvasOf("handoff"), select: { id: true }, take: 1 },
      timeline: {
        select: {
          id: true,
          generatedByAgentRun: { select: { agent: { select: { agentGroup: true } } } },
          changes: { where: { kind: "AI_ASSIST" }, select: { reason: true, createdAt: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
    orderBy: { handoffGeneratedAt: "desc" },
  });
  console.log(`Proyectos con handoff generado: ${proyectos.length}\n`);

  const candidatos: Array<{ id: string; etiqueta: string; grupo: Grupo; desde: string }> = [];
  let wherex = 0;
  let sinCronograma = 0;
  let sinDocumento = 0;
  let yaCongelados = 0;
  for (const p of proyectos) {
    const etiqueta = `${p.client.name} · ${p.name}`;
    if (EXCLUIDOS_POR_NOMBRE.test(p.client.name) || EXCLUIDOS_POR_NOMBRE.test(p.name)) {
      wherex++;
      continue;
    }
    if (!p.canvases[0]) {
      sinDocumento++;
      continue;
    }
    if (!p.timeline) {
      sinCronograma++;
      continue;
    }
    const aplicada = p.timeline.changes.find((c) => razonDeHandoffAplicado(c.reason));
    const creadoPorElHandoff = p.timeline.generatedByAgentRun?.agent?.agentGroup === "handoff";
    const grupo: Grupo | null = aplicada ? "A" : creadoPorElHandoff ? "B" : null;
    if (!grupo) {
      sinCronograma++;
      continue;
    }
    const estado = await leerCongelado(p.id);
    if (estado.congelado) {
      yaCongelados++;
      continue;
    }
    candidatos.push({
      id: p.id,
      etiqueta,
      grupo,
      desde: aplicada ? `aplicado el ${aplicada.createdAt.toISOString().slice(0, 10)}` : "cronograma creado por el handoff",
    });
  }

  const a = candidatos.filter((c) => c.grupo === "A");
  const b = candidatos.filter((c) => c.grupo === "B");
  console.log(`A · con una propuesta del handoff aplicada: ${a.length}`);
  for (const c of a) console.log(`   ${c.etiqueta} (${c.desde})`);
  console.log(`\nB · cronograma creado directo por el handoff: ${b.length}${TAMBIEN_CREADOS ? "" : " (no se congelan sin --tambien-creados)"}`);
  for (const c of b) console.log(`   ${c.etiqueta}`);
  console.log(
    `\nFuera: ${wherex} de Wherex · ${yaCongelados} ya congelados · ${sinDocumento} sin documento de handoff · ` +
      `${sinCronograma} sin cronograma que haya salido del handoff.`,
  );

  const aCongelar = TAMBIEN_CREADOS ? candidatos : a;
  if (!APPLY) {
    console.log(
      `\nSimulacro: se congelarían ${aCongelar.length}. Para aplicar, el mismo comando con --apply y ALLOW_PROD_WRITE=1` +
        `${TAMBIEN_CREADOS ? "" : " (y --tambien-creados para sumar el grupo B)"}.`,
    );
    return;
  }

  let congelados = 0;
  const salteados: string[] = [];
  for (const c of aCongelar) {
    const r = await congelarHandoff(c.id, { via: "migracion", porEmail: null });
    if (r.ok && r.nuevo) {
      congelados++;
      console.log(`  ✓ ${c.etiqueta}`);
    } else if (r.ok) {
      salteados.push(`${c.etiqueta}: ya estaba congelado`);
      console.log(`  · ${c.etiqueta}: ya estaba congelado`);
    } else {
      salteados.push(`${c.etiqueta}: ${r.motivo}`);
      console.log(`  ✗ ${c.etiqueta}: ${r.motivo}`);
    }
  }
  console.log(`\nListo: ${congelados} congelados, ${salteados.length} salteados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
