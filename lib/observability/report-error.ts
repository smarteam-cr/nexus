/**
 * lib/observability/report-error.ts
 *
 * Punto ÚNICO de reporte de errores del cliente. Hoy solo hace `console.error`.
 * F0.4 (diferido hasta tener el DSN) lo va a cablear a `Sentry.captureException`
 * acá mismo — sin tocar los call sites. NO importa Sentry todavía a propósito:
 * no queremos código de un servicio que aún no está activo.
 *
 * El sistema de toasts (useToast) llama a esto en cada `toast.error(...)`, así que
 * cuando enchufemos Sentry, todos los errores visibles al usuario quedan trackeados
 * automáticamente.
 */
export function reportClientError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  // TODO(F0.4 Sentry): Sentry.captureException(
  //   error instanceof Error ? error : new Error(String(error)),
  //   { extra: context },
  // );
  if (context) console.error("[client-error]", error, context);
  else console.error("[client-error]", error);
}
