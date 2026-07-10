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

export interface JobDef {
  key: string;
  /** Se corre UNA vez al arrancar el scheduler (asegurar singletons, etc.). */
  init?: () => Promise<void>;
  /** ¿La ventana de este job matchea este tick? Sin efectos secundarios. */
  shouldRun: (now: Date, parts: CrDateParts) => boolean | Promise<boolean>;
  run: (now: Date) => Promise<void>;
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
