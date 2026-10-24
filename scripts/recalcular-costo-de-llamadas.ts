/**
 * scripts/recalcular-costo-de-llamadas.ts — vuelve a calcular `LlmCall.costUsd` con la tarifa de hoy.
 *
 * El costo de cada llamada se guarda al hacerla, con `lib/ai/precios.ts`. Si una tarifa estaba mal, lo guardado queda mal
 * para siempre y el panel de gasto lo arrastra. Pasó con Sonnet 5 (2026-10-24, roadmap U21): se cobraba a $3/$15 y es
 * $2/$10, así que sus 236 llamadas decían un 50 % de más.
 *
 * Recalcula desde los tokens guardados (entrada, salida, caché leída y escrita, y si fue por lote), con la MISMA función que
 * usa el medidor (`costoDeLlamada`). Por eso se puede correr las veces que haga falta: una fila que ya está bien no se toca.
 * Un modelo sin tarifa no se toca (su costo sigue null).
 *
 * ⛔ POR DEFECTO ES UN SIMULACRO: muestra, por modelo, cuántas filas cambian y el total de antes y de después. Para escribir:
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/recalcular-costo-de-llamadas.ts --modelo claude-sonnet-5 --apply
 *
 * `--modelo` (opcional) limita a un modelo. Antes de escribir guarda en JSON el costo de antes de cada fila que cambia.
 *
 * Por defecto corrige SOLO las filas que ya tenían un costo y es otro. Una fila sin costo (el modelo no tenía tarifa
 * cuando se hizo: las 146 de Sonnet 5 entre el 20 ago y el 3 sep) solo se llena con `--tambien-sin-costo`, porque le
 * suma gasto a meses que quizá ya se cuadraron con la factura.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createScriptPool } from "./lib/db";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { costoDeLlamada } from "../lib/ai/precios";

const APPLY = resolverApply({ tablas: ["LlmCall"] });

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}
const MODELO = arg("--modelo");
const TAMBIEN_SIN_COSTO = process.argv.includes("--tambien-sin-costo");

interface Fila {
  id: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number | null;
  lote: boolean;
}

const CENTESIMA_DE_CENTAVO = 0.000001;

async function main() {
  imprimirDestino();
  const { pool, close } = createScriptPool();
  try {
    const r = await pool.query<Fila>(
      `select id, model, "inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens", "costUsd", lote
         from "LlmCall" where ($1::text is null or model = $1)`,
      [MODELO],
    );

    const cambios: { id: string; antes: number | null; despues: number }[] = [];
    const porModelo = new Map<string, { filas: number; antes: number; despues: number }>();
    let sinCosto = 0;
    for (const f of r.rows) {
      const despues = costoDeLlamada(f.model, f, { lote: f.lote });
      if (despues === null) continue;
      if (f.costUsd === null && !TAMBIEN_SIN_COSTO) {
        sinCosto += 1;
        continue;
      }
      if (f.costUsd !== null && Math.abs(f.costUsd - despues) < CENTESIMA_DE_CENTAVO) continue;
      cambios.push({ id: f.id, antes: f.costUsd, despues });
      const m = porModelo.get(f.model) ?? { filas: 0, antes: 0, despues: 0 };
      m.filas += 1;
      m.antes += f.costUsd ?? 0;
      m.despues += despues;
      porModelo.set(f.model, m);
    }

    console.log(`\nLlamadas leídas: ${r.rows.length}. Con otro costo: ${cambios.length}.`);
    for (const [modelo, m] of porModelo) {
      console.log(`  ${modelo}: ${m.filas} filas · antes US$${m.antes.toFixed(2)} → ahora US$${m.despues.toFixed(2)}`);
    }
    if (sinCosto) console.log(`  (${sinCosto} filas sin costo que hoy tendrían tarifa: no se tocan sin --tambien-sin-costo)`);
    if (!cambios.length) return console.log("\nNada que corregir.");
    if (!APPLY) return console.log("\nEN SECO: no se escribió nada. Para corregir, el mismo comando con --apply y ALLOW_PROD_WRITE=1.");

    const dir = resolve("backups");
    mkdirSync(dir, { recursive: true });
    const archivo = resolve(dir, `costo-de-llamadas-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(archivo, JSON.stringify(cambios.map(({ id, antes }) => ({ id, antes })), null, 1));
    console.log(`\nRespaldo del costo de antes: ${archivo}`);

    const c = await pool.connect();
    try {
      await c.query("begin");
      for (const x of cambios) await c.query(`update "LlmCall" set "costUsd" = $2 where id = $1`, [x.id, x.despues]);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
    console.log(`✓ Corregidas ${cambios.length} filas.`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
