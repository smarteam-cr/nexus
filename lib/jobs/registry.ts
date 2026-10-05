/**
 * lib/jobs/registry.ts
 *
 * Contrato de los jobs programados del server (scheduler de lib/jobs/scheduler.ts)
 * + claim atómico genérico anti-doble-fire sobre CronJobState.
 *
 * Diseño mínimo a propósito (pieza de plataforma del Track B, nacida con el
 * módulo de Éxito del cliente):
 *   - `shouldRun(now, parts)` decide la VENTANA (barato, sin efectos).
 *   - `run(now)` hace el trabajo. Los jobs con disparo "una vez al día" deben
 *     reclamar su dateKey con `claimDateKey` DENTRO de run() — el claim es
 *     compare-and-set (patrón de tickMarketingCron): solo un proceso gana.
 *   - Marketing delega a su tick existente TAL CUAL (ventana + claim propios
 *     en MarketingSettings): cero cambio de comportamiento.
 */
import { prisma } from "@/lib/db/prisma";
import type { CrDateParts } from "./time";

/**
 * Lo que devuelve un `run` que NO tomó el turno: ya corrió hoy, otro proceso ganó el claim, o su
 * interruptor de la base lo tiene apagado. No corrió, así que el scheduler no anota nada.
 *
 * ⚠ Existe porque el scheduler anotaba `ok` después de CUALQUIER `run` que no lanzara. Un job
 * diario que fallaba a las 7:00 quedaba en rojo un minuto: en el tick siguiente perdía el claim,
 * volvía sin hacer nada, y ese «ok» pisaba el fallo. El semáforo de Integraciones mostraba verde
 * sobre un job que había fallado y no iba a reintentar hasta mañana.
 */
export const SIN_TURNO = "sin-turno" as const;

export interface JobDef {
  key: string;
  /** Se corre UNA vez al arrancar el scheduler (asegurar singletons, etc.). */
  init?: () => Promise<void>;
  /** ¿La ventana de este job matchea este tick? Sin efectos secundarios. */
  shouldRun: (now: Date, parts: CrDateParts) => boolean | Promise<boolean>;
  /** `SIN_TURNO` cuando no corrió (ver arriba); cualquier otra salida sin lanzar es una corrida buena. */
  run: (now: Date) => Promise<void | typeof SIN_TURNO>;
}

/** Uno de los pasos INDEPENDIENTES de un job: si falla, los demás corren igual. */
export interface PasoDeJob {
  /** Cómo se llama en el log y en el rojo de Integraciones. */
  paso: string;
  correr: () => Promise<void>;
}

/** Lo que lanza `correrPasosAislados` cuando algún paso falló: dice cuáles y por qué. */
export class PasosDelJobFallidos extends Error {
  readonly fallidos: string[];
  constructor(jobKey: string, fallidos: { paso: string; error: Error }[], total: number) {
    super(`${jobKey}: ${fallidos.length} de ${total} pasos fallaron — ${fallidos.map((f) => `${f.paso}: ${f.error.message}`).join("; ")}`, {
      cause: fallidos[0]?.error,
    });
    this.name = "PasosDelJobFallidos";
    this.fallidos = fallidos.map((f) => f.paso);
  }
}

/**
 * Corre los pasos de un job UNO TRAS OTRO y AISLADOS (2026-10-05): un paso que lanza se anota en el
 * log y el siguiente corre igual. Si alguno falló, al final LANZA `PasosDelJobFallidos`, así el
 * scheduler lo pinta en rojo en Integraciones y lo manda a Sentry como cualquier otro fallo
 * (lib/jobs/scheduler.ts → lib/jobs/estado.ts).
 *
 * ⚠ Existe porque el mantenimiento diario borraba los avisos viejos de «Para ti» ANTES de refrescar
 * las alertas de cobranza, sin aislarlo: si el borrado lanzaba, las alertas no se refrescaban ese día.
 */
export async function correrPasosAislados(jobKey: string, pasos: readonly PasoDeJob[]): Promise<void> {
  const fallidos: { paso: string; error: Error }[] = [];
  for (const p of pasos) {
    try {
      await p.correr();
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      console.error(`[jobs] ${jobKey} — el paso «${p.paso}» falló: ${error.name}: ${error.message}`);
      fallidos.push({ paso: p.paso, error });
    }
  }
  if (fallidos.length > 0) throw new PasosDelJobFallidos(jobKey, fallidos, pasos.length);
}

/** Claim atómico del día para `jobKey`: true = este proceso ganó y debe correr;
 *  false = ya corrió hoy (u otro proceso ganó el compare-and-set). */
export async function claimDateKey(jobKey: string, dateKey: string, now: Date): Promise<boolean> {
  // Asegurar la fila para que el updateMany siempre tenga contra qué comparar.
  // Dos procesos pueden llegar acá en paralelo la PRIMERA vez del job: el upsert
  // de Prisma no es atómico ante creates concurrentes → uno tira P2002. La fila
  // ya existe en ese caso — el compare-and-set de abajo decide al ganador.
  await prisma.cronJobState
    .upsert({ where: { id: jobKey }, update: {}, create: { id: jobKey } })
    .catch((e: unknown) => {
      if ((e as { code?: string })?.code !== "P2002") throw e;
    });
  const claimed = await prisma.cronJobState.updateMany({
    where: {
      id: jobKey,
      OR: [{ lastRunDateKey: null }, { lastRunDateKey: { not: dateKey } }],
    },
    data: { lastRunDateKey: dateKey, lastRunAt: now },
  });
  return claimed.count === 1;
}
