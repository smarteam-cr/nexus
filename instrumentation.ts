/**
 * instrumentation.ts — Next.js lo ejecuta UNA vez en el boot del server.
 * Único uso hoy: arrancar el SCHEDULER de jobs (lib/jobs) — marketing semanal +
 * jobs de Éxito del cliente (estos últimos además gated por CS_WATCHDOG_ENABLED).
 *
 * Gates:
 *  - NEXT_RUNTIME nodejs (no edge).
 *  - CRON_ENABLED="1" EXPLÍCITA (la setea docker-compose en PROD; dev NO la
 *    tiene → el intervalo nunca arranca localmente, aunque instrumentation
 *    corre también en dev).
 */
// Nunca corre en edge (el cron toca Prisma/pg) — declarar el runtime le dice a
// Next que no compile la variante edge de este archivo. Sin esto, la sola
// PRESENCIA de middleware.ts (edge) fuerza a Next a construir igual un bundle
// edge de instrumentation.ts, y ese intenta empaquetar pg→pgpass→split2→'stream'
// (módulo core de Node, inexistente en edge) aunque el guard de abajo nunca lo
// ejecute ahí — "Module not found: Can't resolve 'stream'".
export const runtime = "nodejs";

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Sentry server-side (F0.4, por fin con DSN): gated por env — sin SENTRY_DSN
  // no se inicializa nada (dev local queda igual que siempre). tracesSampleRate 0:
  // solo errores, nada de performance/replay (costo y ruido innecesarios hoy).
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0,
    });
  }

  if (process.env.CRON_ENABLED !== "1") return;
  const { startScheduler } = await import("@/lib/jobs/scheduler");
  startScheduler();
}

// Hook de Next: captura TODOS los errores no manejados de rutas/RSC/server
// actions y los manda a Sentry con el contexto del request. Sin init (sin DSN)
// es un no-op — seguro en dev.
export const onRequestError = Sentry.captureRequestError;
