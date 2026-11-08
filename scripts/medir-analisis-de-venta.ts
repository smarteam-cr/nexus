/**
 * scripts/medir-analisis-de-venta.ts — el análisis de la venta de UNA reunión, en SECO (2026-11-08). NO ESCRIBE.
 *
 * Rearma el análisis con el código de esta rama (el mismo camino que el botón «Volver a analizar»: el material, el modelo
 * y la verificación de citas) sin guardarlo, y lo deja al lado del que está guardado. Sirve para comparar el antes y el
 * después de un cambio del analizador con una reunión real, sin tocar lo que ve el equipo.
 *
 * ── QUÉ ESCRIBE ──────────────────────────────────────────────────────────────────────────────
 *   · NADA en la base: la conexión se abre con `default_transaction_read_only=on`, así que Postgres rechaza cualquier
 *     escritura (también la telemetría de `LlmCall`, que el medidor intenta y avisa en consola; el costo se calcula acá).
 *   · Un archivo en backups/<fecha>-analisis-de-venta/ (gitignoreado). ⚠ Lleva palabras de clientes: no sale de la PC.
 *
 * ── CÓMO SE CORRE ────────────────────────────────────────────────────────────────────────────
 * ⚠ LLAMA A CLAUDE: una llamada (dos si se corta), unos US$0,25.
 *
 *   npx tsx scripts/medir-analisis-de-venta.ts --sesion <id de la reunión>
 *   npx tsx scripts/medir-analisis-de-venta.ts --sesion <id> --por egonzalez@smarteamcr.com   # cuenta como pedido a mano
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  if (i > -1) return process.argv[i + 1] ?? null;
  const conIgual = process.argv.find((a) => a.startsWith(`${nombre}=`));
  return conIgual ? conIgual.slice(nombre.length + 1) : null;
}


async function main() {
  const sesion = arg("--sesion");
  if (!sesion) {
    console.error("Falta --sesion <id de la reunión>.");
    process.exit(1);
  }
  // UNA sola conexión, puesta en solo lectura antes de leer nada, y el pool cerrado antes de llamar al modelo: Postgres
  // rechaza cualquier escritura de esta corrida y, después, no queda conexión con qué escribir (la telemetría falla y avisa).
  process.env.DB_POOL_MAX = "1";
  const { prisma } = await import("@/lib/db/prisma");
  const pool = (globalThis as unknown as { pgPool?: import("pg").Pool }).pgPool;
  if (!pool) throw new Error("No encontré el pool de la app para cerrarlo antes del modelo: no sigo.");
  const { anthropic } = await import("@/lib/anthropic");
  const { prepararElAnalisis } = await import("@/lib/analizador-venta/analizar-server");
  const { HERRAMIENTA_DEL_ANALISIS, leerElAnalisis, leerResultadoGuardado } = await import("@/lib/analizador-venta/analisis");
  const { AGENTE_DEL_ANALIZADOR, MODELO_DEL_ANALIZADOR } = await import("@/lib/analizador-venta/prompt");
  const { insumosParaLaGuia } = await import("@/lib/analizador-venta/para-la-guia");
  const { costoDeLlamada } = await import("@/lib/ai/precios");

  try {
    // set_config de sesión (is_local = false): la conexión queda en solo lectura. Es un SELECT, no una escritura.
    await prisma.$queryRawUnsafe("select set_config('default_transaction_read_only', 'on', false)");
    const prueba = await prisma.$queryRawUnsafe<{ ro: string }[]>("select current_setting('default_transaction_read_only') as ro");
    if (prueba[0]?.ro !== "on") throw new Error("La conexión no quedó en solo lectura: no sigo.");
    console.log("Conexión en solo lectura ✓");

    const p = await prepararElAnalisis(sesion, { pedidoPor: arg("--por") ?? "medicion@local" });
    if (!p.ok) throw new Error(p.error);
    const agente = await prisma.agent.findUnique({ where: { id: AGENTE_DEL_ANALIZADOR }, select: { systemPrompt: true } });
    if (!agente) throw new Error("El agente del analizador no está sembrado.");
    const guardado = await prisma.analisisDeVenta.findUnique({ where: { sessionId: sesion }, select: { resultado: true, descartados: true, criterio: true, analizadoAt: true } });
    const sigue = await prisma.$queryRawUnsafe<{ ro: string }[]>("select current_setting('default_transaction_read_only') as ro");
    if (sigue[0]?.ro !== "on") throw new Error("La conexión dejó de estar en solo lectura a mitad de la lectura: no sigo.");
    await pool.end();

    const t0 = Date.now();
    const msg = await anthropic.messages.create({
      model: MODELO_DEL_ANALIZADOR,
      max_tokens: 10_000,
      system: agente.systemPrompt,
      tools: [HERRAMIENTA_DEL_ANALISIS as never],
      tool_choice: { type: "tool", name: HERRAMIENTA_DEL_ANALISIS.name },
      messages: [{ role: "user", content: [{ type: "text", text: p.material, cache_control: { type: "ephemeral" } }, { type: "text", text: `\n\nAnaliza esta reunión según tus instrucciones y entrégalo con la herramienta ${HERRAMIENTA_DEL_ANALISIS.name}.` }] }],
    });
    const uso = msg.usage;
    const costo = costoDeLlamada(MODELO_DEL_ANALIZADOR, {
      inputTokens: uso.input_tokens,
      outputTokens: uso.output_tokens,
      cacheReadTokens: uso.cache_read_input_tokens ?? 0,
      cacheCreationTokens: uso.cache_creation_input_tokens ?? 0,
    });
    const bloque = msg.content.find((b) => b.type === "tool_use");
    if (!bloque || bloque.type !== "tool_use") throw new Error(`El modelo no usó la herramienta (stop: ${msg.stop_reason}).`);
    const { resultado, descartados } = leerElAnalisis(bloque.input, p.turnos, p.habia);

    const dia = new Date().toISOString().slice(0, 10);
    const carpeta = join("backups", `${dia}-analisis-de-venta`);
    if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true });
    const archivo = join(carpeta, `${sesion}.json`);
    writeFileSync(
      archivo,
      JSON.stringify(
        {
          sesion,
          turnos: p.turnos.length,
          omitidos: p.omitidos,
          yaSeSabe: p.habia.yaSeSabe,
          uso,
          costoUsd: costo,
          segundos: Math.round((Date.now() - t0) / 1000),
          stop: msg.stop_reason,
          antes: guardado ? { ...guardado, resultado: leerResultadoGuardado(guardado.resultado) } : null,
          despues: { resultado, descartados, crudo: bloque.input, paraLaGuia: insumosParaLaGuia(resultado) },
        },
        null,
        1,
      ),
    );
    console.log(`Turnos: ${p.turnos.length}${p.omitidos ? ` (omitidos ${p.omitidos.desde}–${p.omitidos.hasta})` : ""} · descartados: ${descartados}`);
    console.log(`Tokens: ${uso.input_tokens} de entrada, ${uso.output_tokens} de salida · US$${costo?.toFixed(4) ?? "?"}`);
    console.log(`Listo: ${archivo}`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
