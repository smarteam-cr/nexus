/**
 * test/global-setup.integration.ts — corre UNA vez antes de los tests del project `integration`
 * (solo si en la corrida hay alguno: vitest no lo dispara para una corrida de tests unitarios).
 *
 * Pone nexus_test al día con los `scripts/sql/` posteriores al baseline, con la misma regla que
 * `npm run db:local -- bootstrap` (scripts/lib/sql-posteriores.ts). *Por qué:* cada `.sql` nuevo
 * dejaba a nexus_test atrás hasta que alguien volviera a correr el bootstrap, y los tests fallaban
 * con «la columna X no existe», que parece un bug del código (pasó el 2026-10-10 con
 * `LecturaDeReunion.seguimientoIntentos`: siete tests de Tareas en rojo por una base atrasada).
 * Los `.sql` ya son idempotentes por contrato (el bootstrap los reaplica en cada corrida).
 *
 * Lee la URL de `.env.test` SIN tocar `process.env` (este proceso también corre los tests
 * unitarios cuando se corre todo junto). ⛔ Solo una base LOCAL: contra cualquier otro host lanza
 * antes de conectar. Si la base no responde, no frena: `test/setup.integration.ts` lo dice en cada
 * archivo, con el comando para levantarla.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import { describirDestino, esBaseLocal } from "../scripts/lib/guard";
import { aplicarSqlPosteriores } from "../scripts/lib/sql-posteriores";

export default async function ponerAlDiaLaBaseDeTest(): Promise<void> {
  const raiz = process.cwd();
  const url = parse(readFileSync(join(raiz, ".env.test"))).DATABASE_URL;
  if (!esBaseLocal(url)) {
    throw new Error(
      `[integration] .env.test apunta a ${describirDestino(url)}: los tests de integración solo corren contra la ` +
        "base local de npm run db:local.",
    );
  }
  try {
    const corridos = await aplicarSqlPosteriores(url as string, raiz);
    console.log(`[integration] nexus_test al día: ${corridos.length} scripts/sql posteriores al baseline aplicados.`);
  } catch (e) {
    /* Un error de conexión trae su código (ECONNREFUSED, 3D000 si falta la base): eso lo explica el setup de cada
       archivo. Un `.sql` que falla es otra cosa y sí frena: la base quedaría a medio migrar. */
    if (typeof (e as { code?: unknown }).code === "string") {
      console.warn(`[integration] no pude poner al día nexus_test: ${e instanceof Error ? e.message : e}`);
      return;
    }
    throw e;
  }
}
