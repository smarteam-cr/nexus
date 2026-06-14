"use client";

/**
 * app/clients/[id]/error.tsx
 *
 * Error boundary del segmento del workspace del cliente. Captura errores de render del
 * árbol (page → WorkspaceClient → ProjectCanvasPanel / canvases). Queda envuelto por
 * app/clients/[id]/layout.tsx, así que el header y el rail del cliente SOBREVIVEN: solo
 * el contenido cae a este fallback (no pantalla en blanco ni overlay crudo).
 *
 * Motivación: tras editar/borrar componentes con el dev server vivo, el runtime de RSC
 * puede quedar desincronizado y tirar errores de Flight al recargar; en prod, cualquier
 * throw de render de un canvas también caería acá. "Reintentar" re-renderiza el segmento;
 * "Recargar" hace un full reload (escape real para un build de dev stale).
 */
import { useEffect } from "react";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[workspace error boundary]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full rounded-2xl border border-line bg-surface px-6 py-7 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted">
          <svg className="h-5 w-5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-sm font-bold text-fg">Algo se rompió al cargar el workspace</h2>
        <p className="mt-1.5 text-xs text-fg-muted">
          No se pudo renderizar esta sección. Probá reintentar; si persiste, recargá la página.
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
