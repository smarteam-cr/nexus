/**
 * lib/marketing/cron.ts
 *
 * Cron semanal del motor de Contenido: VIERNES 6:00 am America Costa Rica →
 * cadena completa (ingesta → generación). Mecánica:
 *
 *  - `startMarketingCron()` (lo llama instrumentation.ts, gated por CRON_ENABLED)
 *    arranca un setInterval de 60s que llama a `tickMarketingCron(new Date())`.
 *  - El tick dispara si: es VIERNES (hora CR) && hour >= 6 && el dateKey del día
 *    no coincide con `MarketingSettings.lastCronDateKey`. El `>= 6` implementa el
 *    CATCH-UP del mismo día: si el server estaba caído a las 6:00, dispara al
 *    volver mientras siga siendo viernes; el sábado ya no matchea (se salta y
 *    queda el CTA manual).
 *  - Claim ATÓMICO anti-doble-fire (restarts / réplicas futuras): updateMany
 *    compare-and-set sobre lastCronDateKey — solo un proceso gana el día.
 *
 * `tickMarketingCron` recibe `now` para poder probarse sin esperar al viernes
 * (scripts/run-marketing-cron-tick.ts).
 */
import { prisma } from "@/lib/db/prisma";
import { findActiveRun, startMarketingRun } from "./runs";
import { crDateParts } from "@/lib/jobs/time";

const TICK_MS = 60_000;

let interval: ReturnType<typeof setInterval> | null = null;

// Movido a lib/jobs/time.ts al generalizar el cron a un registry de jobs —
// re-export para no romper importadores existentes (scripts).
export { crDateParts } from "@/lib/jobs/time";

export type CronTickDecision =
  | { fired: true; runId: string }
  | { fired: false; reason: string };

/**
 * Un tick del cron. Exportado para test/script. `dryRun` evalúa la ventana y el
 * lock SIN escribir ni disparar.
 */
export async function tickMarketingCron(now: Date, opts?: { dryRun?: boolean }): Promise<CronTickDecision> {
  const { weekday, hour, dateKey } = crDateParts(now);

  if (weekday !== "Fri") return { fired: false, reason: `no es viernes en CR (es ${weekday})` };
  if (hour < 6) return { fired: false, reason: `todavía no son las 6:00 en CR (hora ${hour})` };

  const settings = await prisma.marketingSettings.findUnique({ where: { id: "marketing" } });
  if (settings?.lastCronDateKey === dateKey) {
    return { fired: false, reason: `ya disparó hoy (${dateKey})` };
  }

  const active = await findActiveRun();
  if (active) return { fired: false, reason: `hay una corrida en curso (${active.id})` };

  if (opts?.dryRun) return { fired: false, reason: `DRY-RUN: dispararía la cadena (dateKey ${dateKey})` };

  // Claim atómico: solo el proceso cuyo updateMany matchee (count=1) dispara.
  const claimed = await prisma.marketingSettings.updateMany({
    where: {
      id: "marketing",
      OR: [{ lastCronDateKey: null }, { lastCronDateKey: { not: dateKey } }],
    },
    data: { lastCronDateKey: dateKey, lastCronRunAt: now },
  });
  if (claimed.count !== 1) return { fired: false, reason: "otro proceso ganó el claim" };

  const run = await startMarketingRun("CHAIN", "CRON", null);
  console.log(`[marketing/cron] viernes ${dateKey} — cadena disparada (run ${run.id})`);
  return { fired: true, runId: run.id };
}

/** LEGACY — reemplazado por el scheduler genérico (lib/jobs/scheduler.ts), que
 *  registra este tick como job "marketing-weekly" con mecánica idéntica. Se
 *  conserva por si hay que revertir a una línea en instrumentation.ts. */
export function startMarketingCron(): void {
  if (interval) return;
  // Asegurar la fila singleton para que el claim del tick siempre tenga contra qué comparar.
  prisma.marketingSettings
    .upsert({
      where: { id: "marketing" },
      update: {},
      create: { id: "marketing", brandVoice: "" },
    })
    .catch((e) => console.error("[marketing/cron] no se pudo asegurar MarketingSettings:", e));

  interval = setInterval(() => {
    tickMarketingCron(new Date()).catch((e) => console.error("[marketing/cron] tick falló:", e));
  }, TICK_MS);
  console.log("[marketing/cron] programado: viernes 6:00 am (America Costa Rica), tick cada 60s");
}
