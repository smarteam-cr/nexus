/**
 * instrumentation-client.ts — Next.js lo carga UNA vez en el navegador.
 * Sentry client-side (F0.4): gated por NEXT_PUBLIC_SENTRY_DSN — sin la env no
 * se inicializa nada. El DSN público es seguro de exponer (solo permite ENVIAR
 * eventos al proyecto, no leerlos). Solo errores: sin performance ni replay.
 *
 * OJO deploy: NEXT_PUBLIC_* se inlinea en BUILD time → en Docker tiene que
 * viajar como build-arg (docker-compose.yml → Dockerfile), no solo en el .env
 * de runtime. Ver docs/RUNBOOK.md.
 */
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0,
  });
}

// Hook de navegación del App Router (requerido por @sentry/nextjs para
// correlacionar errores con la ruta activa). No-op sin init.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
