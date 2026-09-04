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
import { tacharTokensDelEvento } from "@/lib/observability/scrub";
import { conSentry } from "@/lib/observability/sentry-lazy";

// C-14 (2026-09-04): el SDK ya no viaja en el chunk raíz de todas las páginas. Se carga con
// `import()` solo si hay DSN (ver lib/observability/sentry-lazy.ts), en un chunk aparte y
// después de la hidratación. Sin DSN nunca se descarga.
let transicion: ((href: string, navigationType: string) => void) | null = null;

conSentry((Sentry) => {
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
    // A-12: el token del enlace externo (64 hex en la URL) no viaja a Sentry — ni en
    // request.url, ni en la transaction, ni en los breadcrumbs. Ver lib/observability/scrub.ts.
    beforeSend: tacharTokensDelEvento,
    beforeBreadcrumb: tacharTokensDelEvento,
  });
  transicion = Sentry.captureRouterTransitionStart;
});

// Hook de navegación del App Router (requerido por @sentry/nextjs para correlacionar
// errores con la ruta activa). Next lo exige SINCRÓNICO y presente al cargar el módulo:
// es un wrapper que, hasta que el SDK llegue, no hace nada (igual que sin DSN) y después
// reenvía. Una transición perdida en esos milisegundos no rompe ninguna captura.
export const onRouterTransitionStart = (href: string, navigationType: string): void => {
  transicion?.(href, navigationType);
};
