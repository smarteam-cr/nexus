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
    // Se inlinea en build (Dockerfile ARG GIT_SHA). Mismo string que el server:
    // un navegador con chunks viejos reporta con la release VIEJA mientras el
    // server reporta la nueva — el deploy mixto se vuelve un filtro de Sentry.
    release: process.env.NEXT_PUBLIC_GIT_SHA,
    tracesSampleRate: 0,
    // Mismo criterio que el server (instrumentation.ts): ruido de conexiones que
    // el usuario corta a mitad de camino. NO filtrar señales de pool/DB.
    ignoreErrors: [/ECONNRESET/, /\baborted\b/i],
  });
}

// Hook de navegación del App Router (requerido por @sentry/nextjs para
// correlacionar errores con la ruta activa). No-op sin init.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
