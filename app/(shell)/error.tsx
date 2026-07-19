"use client";

/**
 * app/(shell)/error.tsx
 *
 * Error boundary de TODAS las secciones internas (roles, sessions, marketing,
 * customer-success, timeline…). Vive DENTRO del layout del route group, así que
 * el AppShell (sidebar + navegación) SOBREVIVE al error: solo el contenido de la
 * sección cae a este fallback. Antes de esto, cualquier throw fuera de
 * clients/[id] escalaba hasta global-error.tsx — pantalla completa sin app.
 *
 * El boundary más específico gana: clients/[id]/error.tsx sigue cubriendo el
 * workspace del cliente. Sí reportamos a Sentry — un throw de sección entera es
 * un incidente que queremos ver (el hook onRequestError cubre el server; esto
 * cubre los errores de render/hidratación del cliente).
 */
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function ShellSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error); // no-op sin DSN configurado
    console.error("[shell error boundary]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full rounded-2xl border border-line bg-surface px-6 py-7 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted">
          <svg className="h-5 w-5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-sm font-bold text-fg">Algo se rompió al cargar esta sección</h2>
        <p className="mt-1.5 text-xs text-fg-muted">
          El resto de la app sigue disponible. Probá reintentar; si persiste, recargá la página.
        </p>
        {error?.digest && (
          <p className="mt-2 text-[10px] font-mono text-fg-muted/70">ref: {error.digest}</p>
        )}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={() => reset()}
            className="text-xs font-semibold text-white bg-brand hover:bg-brand-dark px-3.5 py-2 rounded-lg transition-colors"
          >
            Reintentar
          </button>
          <button
            onClick={() => window.location.reload()}
            className="text-xs font-medium text-fg-muted hover:text-fg border border-line hover:bg-surface-hover px-3.5 py-2 rounded-lg transition-colors"
          >
            Recargar
          </button>
        </div>
      </div>
    </div>
  );
}
