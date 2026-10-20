/**
 * scripts/medir-preguntas-del-objetivo.ts — cuánto cuesta y qué propone «al guardar el objetivo, unas tres preguntas
 * nuevas» (CEMACO, 2026-10-20), con una exploración real. NO ESCRIBE la exploración.
 *
 * Arma el MISMO pedido que la ruta `…/guia/objetivo` (lib/exploraciones/guia-ajustes-server.ts › `entradaDelObjetivo` y
 * lib/exploraciones/guia-pregunta-pedido.ts), lo manda, lo lee con la misma revisión (tuteo, corta, sin la cita adelante,
 * sin repetir lo que el cliente ya dijo ni lo que ya está en la guía) y muestra las que quedan, con sus tokens y su costo.
 * Si salen menos de dos, hace el segundo pedido como la ruta. ⚠ Imprime palabras de clientes: no sale de la PC.
 *
 * ── QUÉ ESCRIBE ──────────────────────────────────────────────────────────────────────────────
 *   · Nada, salvo la telemetría de `LlmCall` que anota el cliente de Anthropic, a nombre de --por (presupuesto humano).
 *
 * ── CÓMO SE CORRE ────────────────────────────────────────────────────────────────────────────
 * ⚠ LLAMA A CLAUDE: una llamada corta por corrida (dos si la primera no sirvió). Unos US$0,02.
 *
 *   npx tsx scripts/medir-preguntas-del-objetivo.ts --por egonzalez@smarteamcr.com                    # CEMACO, su objetivo
 *   npx tsx scripts/medir-preguntas-del-objetivo.ts --por … --objetivo "Enfocarnos en marketing…"     # con otro objetivo
 *   npx tsx scripts/medir-preguntas-del-objetivo.ts --por … --cliente "Larce"                         # otra exploración
 *   npx tsx scripts/medir-preguntas-del-objetivo.ts --por … --id <exploracionId>
 *
 * Wherex queda fuera siempre (hizo churn y es el cliente de prueba de Nexus).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createScriptPool } from "./lib/db";

process.env.DB_POOL_MAX ??= "2";

const EXCLUIDOS_POR_NOMBRE = /wherex/i;

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  if (i > -1) return process.argv[i + 1] ?? null;
  const conIgual = process.argv.find((a) => a.startsWith(`${nombre}=`));
  return conIgual ? conIgual.slice(nombre.length + 1) : null;
}
const POR = (arg("--por") ?? "").trim().toLowerCase();

/** La exploración: por id, o la más reciente del cliente (por nombre, CEMACO si no se dice). Solo lectura. */
async function elegir(): Promise<{ id: string; empresa: string } | null> {
  const { pool, close } = createScriptPool();
  try {
    const c = await pool.connect();
    try {
      await c.query("SET default_transaction_read_only = on");
      const r = await c.query<{ id: string; empresa: string }>(
        `select e.id, cl.name as empresa
           from "ExploracionDeVenta" e join "Client" cl on cl.id = e."clientId"
          where e."archivadaEn" is null and ($1::text is null or e.id = $1) and ($1::text is not null or cl.name ilike '%' || $2 || '%')
          order by e."updatedAt" desc limit 5`,
        [arg("--id"), arg("--cliente") ?? "Cemaco"],
      );
      return r.rows.find((x) => !EXCLUIDOS_POR_NOMBRE.test(x.empresa)) ?? null;
    } finally {
      c.release();
    }
  } finally {
    await close();
  }
}

async function main() {
  if (!POR.includes("@")) {
    console.error("Falta --por <tu correo>: las llamadas a Claude se anotan a tu nombre, contra el presupuesto humano.");
    process.exit(1);
  }
  const elegida = await elegir();
  if (!elegida) {
    console.error("No encontré esa exploración.");
    process.exit(1);
  }
  const { prisma } = await import("@/lib/db/prisma");
  const { getAnthropic } = await import("@/lib/anthropic");
  const { conContextoDeIA } = await import("@/lib/ai/contexto-de-corrida");
  const { costoDeLlamada } = await import("@/lib/ai/precios");
  const { contextoParaLaGuia, nombresDelEquipo, AGENTE_DE_LA_EXPLORACION } = await import("@/lib/exploraciones/agente");
  const { entradaDelObjetivo, ORIGEN_DEL_OBJETIVO } = await import("@/lib/exploraciones/guia-ajustes-server");
  const { avisoParaOtraVez, leerPreguntasDelObjetivo, pedidoDePreguntasDelObjetivo } = await import("@/lib/exploraciones/guia-pregunta-pedido");

  const costo = (m: Anthropic.Messages.Message) =>
    costoDeLlamada(m.model, {
      inputTokens: m.usage.input_tokens,
      outputTokens: m.usage.output_tokens,
      cacheReadTokens: m.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: m.usage.cache_creation_input_tokens ?? 0,
    }) ?? 0;

  try {
    const [base, equipo] = await Promise.all([contextoParaLaGuia(elegida.id), nombresDelEquipo()]);
    const { sesionId, entrada } = entradaDelObjetivo(base, arg("--objetivo") ?? undefined, equipo);
    console.log(`\n${elegida.empresa} · exploración ${elegida.id} · ${base.marco.clave === "cs" ? "proyecto" : "preventa"} · próxima sesión: la ${base.ctx.proxima.numero} (${sesionId ?? "sin sesión todavía"})`);
    if (!entrada) {
      console.log("La próxima sesión no tiene objetivo: pásalo con --objetivo.");
      return;
    }
    console.log(`Objetivo: ${entrada.objetivo}`);
    console.log(`La guía tiene ${entrada.guia.length} preguntas · ${entrada.temas.length} temas posibles · ${entrada.yaPropuestas.length} ya propuestas para este objetivo\n`);

    const pedir = (e: typeof entrada, aviso = "") =>
      conContextoDeIA(
        { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: null, clientId: base.fila.clientId, triggeredByEmail: POR, origen: `${ORIGEN_DEL_OBJETIVO}:medicion` },
        () => getAnthropic().messages.create(pedidoDePreguntasDelObjetivo(e, aviso)),
      );
    const t0 = Date.now();
    const m1 = await pedir(entrada);
    let total = costo(m1);
    console.log(`Llamada 1: ${m1.usage.input_tokens} tokens de entrada · ${m1.usage.output_tokens} de salida · US$${costo(m1).toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    let l = leerPreguntasDelObjetivo(m1, entrada, base.ctx.saber);
    if (l.preguntas.length < 2) {
      const aviso = l.fallas.map(avisoParaOtraVez).filter((x, i, xs) => xs.indexOf(x) === i).join("");
      const m2 = await pedir({ ...entrada, yaPropuestas: [...entrada.yaPropuestas, ...l.preguntas.map((p) => p.pregunta)] }, aviso);
      total += costo(m2);
      console.log(`Llamada 2 (salieron menos de dos): ${m2.usage.input_tokens} entrada · ${m2.usage.output_tokens} salida · US$${costo(m2).toFixed(4)}`);
      const otra = leerPreguntasDelObjetivo(m2, entrada, base.ctx.saber);
      l = { preguntas: [...l.preguntas, ...otra.preguntas].slice(0, 3), fallas: [...l.fallas, ...otra.fallas] };
    }
    console.log(`\nPropone ${l.preguntas.length}:`);
    for (const p of l.preguntas) {
      console.log(`  · ${p.pregunta}${p.para ? `  [${p.para}]` : ""}`);
      for (const r of p.repreguntas) console.log(`      ↳ ${r}`);
    }
    if (l.fallas.length) console.log(`\nDescartadas por la revisión: ${l.fallas.map((f) => f.motivo).join(", ")}`);
    console.log(`\nCosto de la corrida: US$${total.toFixed(4)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
