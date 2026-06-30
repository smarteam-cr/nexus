"use client";

/**
 * components/clients/context-column.tsx
 *
 * Primitivas presentacionales de la sección "Contexto" del proyecto (3 columnas):
 * fila compacta + lista con estado vacío + shell de columna con header. Las consumen
 * ProjectContextSection (orquestador) y los hijos en columnMode (HubspotTimelinePanel,
 * SessionSelectionReview). Módulo aparte para evitar el import circular.
 */
import { type ReactNode, Children } from "react";

/** Fila compacta de una fuente de contexto: meta (tipo · fecha) + título + snippet, opción de quitar. */
export function ContextRow({
  icon,
  meta,
  title,
  snippet,
  onRemove,
  removeTitle,
}: {
  icon?: string;
  meta: string;
  title?: string;
  snippet?: string;
  onRemove?: () => void;
  removeTitle?: string;
}) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-line bg-surface-muted px-2.5 py-1.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] text-fg-muted">
          {icon && (
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
          )}
          <span className="truncate">{meta}</span>
        </div>
        {title && <p className="text-xs font-medium text-fg truncate mt-0.5">{title}</p>}
        {snippet && <p className="text-[11px] text-fg-muted truncate">{snippet}</p>}
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          title={removeTitle ?? "Quitar"}
          className="text-fg-muted hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </li>
  );
}

/** Lista de la columna: skeleton mientras carga, estado vacío si no hay ítems, sino la lista con scroll acotado. */
export function ContextColumnList({
  loading,
  empty,
  children,
}: {
  loading?: boolean;
  empty: string;
  children: ReactNode;
}) {
  if (loading) return <div className="h-12 rounded-lg skeleton-shimmer" />;
  if (Children.count(children) === 0) {
    return <p className="text-[11px] text-fg-muted py-4 text-center">{empty}</p>;
  }
  return <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">{children}</ul>;
}

/** Shell de una columna de Contexto: header (icono + título + contador) + contenido. */
export function ContextColumn({
  icon,
  color,
  title,
  count,
  children,
}: {
  icon: string;
  color: string;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col min-w-0 rounded-xl border border-line bg-surface-muted p-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <svg className="w-4 h-4 flex-shrink-0" style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
        <span className="text-xs font-semibold text-fg">{title}</span>
        {count != null && (
          <span className="ml-auto text-[10px] text-fg-muted bg-surface border border-line rounded-full px-1.5 py-0.5">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** Paths de íconos (heroicons-style) compartidos por las columnas. */
export const CTX_ICONS = {
  hubspot: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  meet: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
  note: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
} as const;
