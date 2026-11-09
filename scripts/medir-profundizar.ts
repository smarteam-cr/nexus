/**
 * scripts/medir-profundizar.ts — cuánto tarda y cuántos intentos pide «Para profundizar» de la guía de la preparación
 * (2026-11-08). NO ESCRIBE NADA EN LA BASE.
 *
 * Dos pasos, para que el antes y el después se midan sobre las MISMAS guías:
 *   1. `--generar`: arma la guía de cada preventa como el botón (contextoParaLaGuia → pedidoDeLaGuia, Sonnet) y guarda las
 *      agendas, sin «Para profundizar», en el JSON de --agendas. ⚠ Lleva palabras de clientes: va al scratchpad, no al repo.
 *   2. sin `--generar`: lee ese JSON y pide «Para profundizar» como la app (lib/exploraciones/profundizar-server.ts):
 *      un bloque a la vez (lo que pasa al abrir el plegable) y, con `--todos`, todos en una llamada (como «En vivo»).
 *      Cuenta segundos, intentos, costo y qué hizo descartar el primer intento.
 *
 *   PGOPTIONS="-c default_transaction_read_only=on" npx tsx scripts/medir-profundizar.ts --ids a,b,c --agendas <ruta.json> --generar
 *   PGOPTIONS="-c default_transaction_read_only=on" npx tsx scripts/medir-profundizar.ts --agendas <ruta.json> [--todos] [--veces 2]
 *
 * ⚠ LLAMA A CLAUDE: generar cuesta ~US$0,15 por preventa; medir, ~US$0,01 por bloque. Ese gasto NO queda en «Gasto de
 *   la IA»: con la conexión de solo lectura el medidor no puede anotar (deja un aviso en la consola por llamada).
 * ⚠ El JSON de --agendas lleva palabras de clientes: el script se niega a escribirlo dentro del repo.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { readFileSync, writeFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";

process.env.DB_POOL_MAX ??= "2";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}
const IDS = (arg("--ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const AGENDAS = arg("--agendas");
const GENERAR = process.argv.includes("--generar");
const TODOS = process.argv.includes("--todos");
const VECES = Number(arg("--veces") ?? "1");

async function main() {
  if (!AGENDAS) throw new Error("Falta --agendas <ruta.json>.");
  const { relative, resolve } = await import("node:path");
  const dentro = relative(process.cwd(), resolve(AGENDAS));
  if (GENERAR && !dentro.startsWith("..") && !/^[a-z]:/i.test(dentro)) throw new Error("--agendas lleva palabras de clientes: pásale una ruta fuera del repo.");
  if (!/default_transaction_read_only=on/.test(process.env.PGOPTIONS ?? "")) throw new Error('Correlo con PGOPTIONS="-c default_transaction_read_only=on".');
  const { getAnthropic } = await import("@/lib/anthropic");
  const { costoDeLlamada } = await import("@/lib/ai/precios");
  const anthropic = getAnthropic();
  const costo = (m: Anthropic.Messages.Message) =>
    costoDeLlamada(m.model, {
      inputTokens: m.usage.input_tokens,
      outputTokens: m.usage.output_tokens,
      cacheReadTokens: m.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: m.usage.cache_creation_input_tokens ?? 0,
    }) ?? 0;

  if (GENERAR) {
    const { prisma } = await import("@/lib/db/prisma");
    const { contextoParaLaGuia } = await import("@/lib/exploraciones/agente");
    const { pedidoDeLaGuia, leerLaGuiaDelAgente } = await import("@/lib/exploraciones/guia-pedido");
    const salida: unknown[] = [];
    try {
      for (const id of IDS) {
        const base = await contextoParaLaGuia(id);
        if (/wherex/i.test(base.fila.client.name)) throw new Error("Wherex queda fuera.");
        const r = await anthropic.messages.stream(pedidoDeLaGuia(base.ctx)).finalMessage();
        const guia = leerLaGuiaDelAgente(r, base.ctx, null, base.ahora);
        console.log(`${base.fila.client.name}: ${guia?.agenda ? `${guia.agenda.bloques.length} bloques` : "SIN GUÍA"} · US$${costo(r).toFixed(3)}`);
        if (!guia?.agenda) continue;
        salida.push({
          empresa: base.fila.client.name,
          industria: base.fila.client.industry ?? null,
          marco: base.marco.clave,
          objetivo: guia.objetivoAceptado ?? base.ctx.contextoDeLaSesion?.objetivo ?? guia.objetivo ?? null,
          claves: guia.agenda.claves,
          bloques: guia.agenda.bloques.map((b) => ({ titulo: b.titulo, tipo: b.tipo, abre: b.abre, guia: b.guia, impacto: b.impacto, averiguar: b.averiguar })),
        });
      }
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
    writeFileSync(AGENDAS, JSON.stringify(salida, null, 2), "utf8");
    console.log(`Listo: ${AGENDAS}`);
    return;
  }

  const { pedidoDeProfundizar, leerProfundizar, hayQueReintentar, avisoDeProfundizar, mejorDeLasDos } = await import("@/lib/exploraciones/profundizar-pedido");
  type Entrada = Parameters<typeof pedidoDeProfundizar>[0];
  const guias = JSON.parse(readFileSync(AGENDAS, "utf8")) as (Omit<Entrada, "bloques"> & { bloques: Entrada["bloques"][number]["bloque"][] })[];

  interface Fila {
    empresa: string;
    que: string;
    segundos: number;
    intentos: number;
    costo: number;
    preguntas: string;
    motivos: string[];
  }
  const filas: Fila[] = [];
  const una = async (empresa: string, que: string, entrada: Entrada) => {
    const t0 = Date.now();
    const r1 = await anthropic.messages.create(pedidoDeProfundizar(entrada), { timeout: 45_000, maxRetries: 1 });
    const primera = leerProfundizar(r1, entrada);
    const motivos = [
      ...primera.conProblema.map((c) => `${c.problema}: «${c.pregunta}»`),
      ...entrada.bloques.filter((x) => x.bloque.tipo === "cuerpo" && !primera.porBloque[x.i]?.length).map((x) => `bloque ${x.i} del cuerpo sin preguntas`),
      ...(r1.stop_reason === "max_tokens" ? ["CORTADA por max_tokens"] : []),
    ];
    if (motivos.some((m) => m.includes("sin preguntas")))
      console.log("    CRUDO:", JSON.stringify(r1.content.map((b) => (b.type === "tool_use" ? b.input : b))), r1.stop_reason);
    let porBloque = primera.porBloque;
    let intentos = 1;
    let c = costo(r1);
    if (hayQueReintentar(primera, entrada)) {
      const r2 = await anthropic.messages.create(pedidoDeProfundizar(entrada, avisoDeProfundizar(primera.conProblema)), { timeout: 45_000, maxRetries: 1 });
      porBloque = mejorDeLasDos(primera, leerProfundizar(r2, entrada));
      intentos = 2;
      c += costo(r2);
    }
    const f: Fila = {
      empresa,
      que,
      segundos: (Date.now() - t0) / 1000,
      intentos,
      costo: c,
      preguntas: entrada.bloques.map((x) => porBloque[x.i]?.length ?? 0).join(""),
      motivos,
    };
    filas.push(f);
    console.log(`${empresa} · ${que}: ${f.segundos.toFixed(1)} s · ${intentos} intento(s) · US$${c.toFixed(4)} · preguntas ${f.preguntas}${motivos.length ? `\n    ${motivos.join("\n    ")}` : ""}`);
    for (const x of entrada.bloques) for (const p of porBloque[x.i] ?? []) console.log(`      [${x.i}] ${p}`);
  };

  for (let v = 0; v < VECES; v++) {
    for (const g of guias) {
      const bloques = g.bloques.map((bloque, i) => ({ i, bloque }));
      const tareas = bloques.map((b) => una(g.empresa, `bloque ${b.i} (${b.bloque.tipo})`, { ...g, bloques: [b] }));
      if (TODOS) tareas.push(una(g.empresa, "todos los bloques", { ...g, bloques }));
      await Promise.all(tareas);
    }
  }

  const porBloque = filas.filter((f) => f.que.startsWith("bloque"));
  const prom = (fs: Fila[], k: "segundos" | "costo" | "intentos") => fs.reduce((a, f) => a + f[k], 0) / Math.max(fs.length, 1);
  console.log(
    `\nUn bloque: ${porBloque.length} pedidos · ${porBloque.filter((f) => f.intentos === 1).length} en un intento · promedio ${prom(porBloque, "segundos").toFixed(1)} s · US$${prom(porBloque, "costo").toFixed(4)} · ${prom(porBloque, "intentos").toFixed(2)} intentos`,
  );
  const todos = filas.filter((f) => f.que === "todos los bloques");
  if (todos.length)
    console.log(`Todos los bloques: ${todos.length} pedidos · ${todos.filter((f) => f.intentos === 1).length} en un intento · promedio ${prom(todos, "segundos").toFixed(1)} s · US$${prom(todos, "costo").toFixed(4)}`);
  const conteo = new Map<string, number>();
  for (const f of filas) for (const m of f.motivos) conteo.set(m.split(":")[0], (conteo.get(m.split(":")[0]) ?? 0) + 1);
  // Lo que descartó el primer intento, haya o no pedido otro (la de repuesto cubre la mayoría): los intentos de verdad
  // son los de arriba.
  console.log("Lo que descartó el primer intento:", Object.fromEntries(conteo));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
