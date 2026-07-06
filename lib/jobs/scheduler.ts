/**
 * lib/jobs/scheduler.ts
 *
 * Scheduler ÚNICO del server: un setInterval de 60s que recorre los jobs del
 * registry (lib/jobs/defs.ts). Reemplaza al startMarketingCron dedicado —
 * marketing ahora es un job más (con su mecánica intacta).
 *
 *  - Idempotente (segundo start = no-op) — mismo contrato que el cron viejo.
 *  - try/catch POR JOB: un job roto no tumba a los demás.
 *  - Flag anti-reentrada: si un tick tarda más de 60s (p.ej. refresh de señales
 *    de muchos clientes), el siguiente tick se salta en vez de solaparse.
 *
 * Lo arranca instrumentation.ts (gates NEXT_RUNTIME nodejs + CRON_ENABLED=1 —
 * solo PROD los setea; en dev los jobs se prueban por scripts).
 */
import { crDateParts } from "./time";
import { allJobs } from "./defs";

const TICK_MS = 60_000;

let interval: ReturnType<typeof setInterval> | null = null;
let ticking = false;

export async function runSchedulerTick(now: Date): Promise<void> {
  const parts = crDateParts(now);
  for (const job of allJobs()) {
    try {
      if (await job.shouldRun(now, parts)) await job.run(now);
    } catch (e) {
      console.error(`[jobs] ${job.key} falló:`, e);
    }
  }
}

/** Arranca el scheduler (idempotente). Lo llama instrumentation.ts en el boot. */
export function startScheduler(): void {
  if (interval) return;

  // init() de cada job (asegurar singletons) — best-effort, no bloquea el boot.
  for (const job of allJobs()) {
    job.init?.().catch((e) => console.error(`[jobs] init de ${job.key} falló:`, e));
  }

  interval = setInterval(() => {
    if (ticking) return; // el tick anterior sigue corriendo — no solapar
    ticking = true;
    runSchedulerTick(new Date())
      .catch((e) => console.error("[jobs] tick falló:", e))
      .finally(() => {
        ticking = false;
      });
  }, TICK_MS);
  console.log(
    `[jobs] scheduler arrancado (tick 60s) — jobs: ${allJobs()
      .map((j) => j.key)
      .join(", ")}`,
  );
}
