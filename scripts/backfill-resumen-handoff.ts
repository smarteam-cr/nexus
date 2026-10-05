/**
 * scripts/backfill-resumen-handoff.ts — «QUÉ SE VENDIÓ» PARA LOS HANDOFFS QUE NO LO TIENEN.
 *
 * Una sola vez, con el rediseño de la ficha (2026-10-04, decisión de Elías). El resumen corto del
 * handoff se escribe solo en cada corrida del agente y, desde esta tanda, al abrir el Resumen del
 * proyecto quien puede generarlo. Los handoffs generados antes de que existiera el resumen —o que
 * se regeneraron después de escribirlo— quedan sin él para el CSE, que no tiene la celda para
 * pedirlo. Este script los llena.
 *
 * Lee el DOCUMENTO ya escrito (no las sesiones) con `generarResumenDeHandoff`, el mismo camino que
 * el botón: no regenera el handoff ni pisa nada de lo editado a mano. Solo escribe
 * `Project.handoffResumen` y `Project.handoffResumenAt`.
 *
 *   npx tsx scripts/backfill-resumen-handoff.ts            # simulacro: cuántos, cuáles y cuánto cuesta
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/backfill-resumen-handoff.ts --apply
 *
 * En PowerShell: `$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/backfill-resumen-handoff.ts --apply`.
 * Correrlo dos veces no cambia nada la segunda: lo que ya tiene un resumen al día se salta.
 */
import "dotenv/config";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import {
  RESUMEN_HANDOFF_MODEL,
  generarResumenDeHandoff,
  resumenDesactualizado,
} from "@/lib/handoff/resumen";

const APPLY = resolverApply({ tablas: ["Project"] });

/** Lo mismo que lee el generador: 24.000 caracteres como mucho (`MAX_CARACTERES_CONTEXTO`). */
const TOPE_DE_CONTEXTO = 24_000;
/** Caracteres por token medidos en los prompts en español del repo (A3, 2026-09). */
const CARACTERES_POR_TOKEN = 3.2;
/** Precio de lista de `claude-sonnet-4-6`, por millón de tokens. */
const USD_ENTRADA = 3;
const USD_SALIDA = 15;
/** El generador pide `max_tokens: 500`; se cobra lo que salga, esto es el techo. */
const TOKENS_DE_SALIDA = 500;

async function main() {
  imprimirDestino();
  console.log(`Modelo: ${RESUMEN_HANDOFF_MODEL} · ${APPLY ? "APLICANDO" : "simulacro (nada se escribe)"}\n`);

  const proyectos = await prisma.project.findMany({
    where: { handoffGeneratedAt: { not: null } },
    select: {
      id: true,
      name: true,
      handoffResumen: true,
      handoffResumenAt: true,
      handoffGeneratedAt: true,
      client: { select: { name: true } },
    },
    orderBy: { handoffGeneratedAt: "desc" },
  });

  const pendientes = proyectos.filter((p) => !p.handoffResumen || resumenDesactualizado(p));
  console.log(`Handoffs generados: ${proyectos.length} · sin resumen o con el resumen viejo: ${pendientes.length}\n`);

  let costoMax = 0;
  const conDocumento: typeof pendientes = [];
  for (const p of pendientes) {
    const doc = await loadHandoffContext(p.id);
    const largo = Math.min(doc.trim().length, TOPE_DE_CONTEXTO);
    if (largo < 200) {
      console.log(`  ·  ${p.client.name} · ${p.name}: el documento está vacío (no se resume)`);
      continue;
    }
    const costo = ((largo / CARACTERES_POR_TOKEN + 400) / 1e6) * USD_ENTRADA + (TOKENS_DE_SALIDA / 1e6) * USD_SALIDA;
    costoMax += costo;
    conDocumento.push(p);
    console.log(`  ${p.handoffResumen ? "↻" : "+"}  ${p.client.name} · ${p.name} (${largo.toLocaleString("es-CR")} caracteres)`);
  }

  console.log(
    `\nA resumir: ${conDocumento.length} (+ nuevo, ↻ viejo). Costo estimado: hasta US$${costoMax.toFixed(2)} ` +
      `(${conDocumento.length} llamadas a ${RESUMEN_HANDOFF_MODEL}).`,
  );

  if (!APPLY) {
    console.log("\nSimulacro: no se escribió nada. Para aplicar, el mismo comando con --apply y ALLOW_PROD_WRITE=1.");
    return;
  }

  let ok = 0;
  const fallos: string[] = [];
  for (const p of conDocumento) {
    const r = await generarResumenDeHandoff(p.id);
    if (r.status === "ok") {
      ok++;
      console.log(`  ✓ ${p.client.name} · ${p.name}`);
    } else {
      const motivo = r.status === "error" ? r.error : "el documento está vacío";
      fallos.push(`${p.client.name} · ${p.name}: ${motivo}`);
      console.log(`  ✗ ${p.client.name} · ${p.name}: ${motivo}`);
    }
  }
  console.log(`\nListo: ${ok} resumidos, ${fallos.length} con error.`);
  if (fallos.length) console.log("Los que fallaron se pueden volver a correr: el script los vuelve a encontrar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
