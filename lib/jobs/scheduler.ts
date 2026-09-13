/**
 * lib/jobs/scheduler.ts
 *
 * Scheduler ÚNICO del server: un setInterval de 60s que recorre los jobs del
 * registry (lib/jobs/defs.ts). Reemplaza al startMarketingCron dedicado —
 * marketing ahora es un job más (con su mecánica intacta).
 *
 *  - Idempotente (segundo start = no-op) — mismo contrato que el cron viejo.
 *  - try/catch POR JOB: un job roto no tumba a los demás — y llega a Sentry con
 *    `tags.job` (B-02): en el VPS un console.error es una línea que nadie lee.
 *  - Cada corrida deja su resultado en CronJobState.lastResult (B-03): el semáforo de
 *    Integraciones lo pinta. El claim del día NO se libera al fallar (ver lib/jobs/estado.ts).
 *  - Flag anti-reentrada: si un tick tarda más de 60s (p.ej. refresh de señales
 *    de muchos clientes), el siguiente tick se salta en vez de solaparse.
 *
 * Lo arranca instrumentation.ts (gates NEXT_RUNTIME nodejs + CRON_ENABLED=1 —
 * solo PROD los setea; en dev los jobs se prueban por scripts).
 */
import * as Sentry from "@sentry/nextjs";
import { registrarResultado } from "./estado";
import { crDateParts } from "./time";
import { allJobs } from "./defs";
import { SIN_TURNO } from "./registry";
import { InvariantesVioladosError } from "@/lib/invariantes/job";

const TICK_MS = 60_000;

let interval: ReturnType<typeof setInterval> | null = null;
let ticking = false;

/**
 * Cómo agrupa Sentry el fallo de un job. `undefined` = el agrupamiento por defecto (stack + mensaje).
 *
 * ⚠ Los invariantes en rojo llevan la LISTA de violados en la huella. Con el agrupamiento por
 * defecto todos los rojos de `invariants-daily` caen en el mismo issue —mismo stack—, así que un
 * invariante que se pone en rojo mientras otro ya lo estaba no abre nada: se suma como un evento
 * más a un issue que alguien ya dio por visto. Con la lista, cambiarla abre un issue nuevo.
 */
export function huellaDeSentry(jobKey: string, err: Error): string[] | undefined {
  if (err instanceof InvariantesVioladosError) return ["job", jobKey, "invariantes", ...err.violados];
  return undefined;
}

export async function runSchedulerTick(now: Date): Promise<void> {
  const parts = crDateParts(now);
  for (const job of allJobs()) {
    try {
      if (await job.shouldRun(now, parts)) {
        const salida = await job.run(now);
        // B-03: la corrida que terminó bien queda anotada (con rezago de hasta 10 min por job).
        // ⚠ Solo si CORRIÓ: el «ok» de un tick que no tomó el turno tapaba el rojo de la corrida
        // real un minuto después (ver SIN_TURNO en registry.ts).
        if (salida !== SIN_TURNO) await registrarResultado(job.key, { ok: true, at: now.toISOString() });
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      // B-02 (auditoría 2026-09-03): diez jobs podían fallar todos los días y el primero en
      // enterarse era un cliente. A Sentry con el job como tag (sin DSN es no-op); al log,
      // nombre + mensaje (A-15) — el objeto entero, con su stack, viaja en el evento.
      console.error(`[jobs] ${job.key} falló: ${err.name}: ${err.message}`);
      const huella = huellaDeSentry(job.key, err);
      Sentry.captureException(err, huella ? { tags: { job: job.key }, fingerprint: huella } : { tags: { job: job.key } });
      // B-03: el fallo queda anotado SIEMPRE — registrarResultado nunca lanza.
      await registrarResultado(job.key, { ok: false, error: `${err.name}: ${err.message}`, at: now.toISOString() });
    }
  }
}

/** Arranca el scheduler (idempotente). Lo llama instrumentation.ts en el boot. */
export function startScheduler(): void {
  if (interval) return;

  // init() de cada job (asegurar singletons) — best-effort, no bloquea el boot.
  for (const job of allJobs()) {
    job.init?.().catch((e) => {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error(`[jobs] init de ${job.key} falló: ${err.name}: ${err.message}`);
      Sentry.captureException(err, { tags: { job: job.key, fase: "init" } });
    });
  }

  interval = setInterval(() => {
    if (ticking) return; // el tick anterior sigue corriendo — no solapar
    ticking = true;
    runSchedulerTick(new Date())
      .catch((e) => {
        const err = e instanceof Error ? e : new Error(String(e));
        console.error(`[jobs] tick falló: ${err.name}: ${err.message}`);
        Sentry.captureException(err, { tags: { job: "scheduler-tick" } });
      })
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
