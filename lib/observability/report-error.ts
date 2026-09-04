/**
 * lib/observability/report-error.ts
 *
 * Punto ÚNICO de reporte de errores del cliente. F0.4 CABLEADO (2026-07-07):
 * manda a Sentry cuando NEXT_PUBLIC_SENTRY_DSN está configurado (sin DSN,
 * captureException es un no-op del SDK — dev local queda igual que siempre)
 * y SIEMPRE deja el console.error como respaldo local.
 *
 * El sistema de toasts (useToast) llama a esto en cada `toast.error(...)`, así
 * que todos los errores visibles al usuario quedan trackeados automáticamente.
 *
 * C-14 (2026-09-04): el Toast vive en el layout raíz, así que un import estático del SDK
 * acá lo metía en el chunk de TODAS las páginas. Va por `conSentry`: bajo demanda, solo con DSN.
 */
import { conSentry } from "./sentry-lazy";

export function reportClientError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  conSentry((Sentry) => {
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), { extra: context });
  });
  if (context) console.error("[client-error]", error, context);
  else console.error("[client-error]", error);
}
