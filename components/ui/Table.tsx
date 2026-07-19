"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { SearchFilterBar } from "./SearchFilterBar";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  /** Clase Tailwind de ancho, ej. "w-48" o "w-[1%]" (encoger al contenido). */
  width?: string;
  align?: "left" | "right" | "center";
  /** Oculta la columna en viewports angostos (hidden sm:table-cell). */
  hideOnMobile?: boolean;
  /**
   * Si se define, la columna es ordenable: devuelve el valor escalar de orden
   * (no el ReactNode). null/undefined ordenan siempre al final.
   */
  sortValue?: (row: T) => string | number | Date | null | undefined;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Si se define, la fila completa es clickeable (hover + cursor + teclado). */
  onRowClick?: (row: T) => void;
  /** Se renderiza en lugar de la tabla cuando NO hay datos (rows vacío). */
  empty?: React.ReactNode;
  /** Activa el campo de búsqueda; `getText` arma el texto buscable de la fila. */
  search?: { placeholder?: string; getText: (row: T) => string };
  /** Controles de filtro extra para el toolbar (selects, tabs). */
  filters?: React.ReactNode;
  /** Acción a la derecha del toolbar — normalmente el botón "Nuevo …". */
  action?: React.ReactNode;
  /** Orden inicial; la columna referida debe tener `sortValue`. */
  initialSort?: { key: string; dir: "asc" | "desc" };
  className?: string;
}

type SortValue = string | number | Date | null | undefined;
type SortState = { key: string; dir: "asc" | "desc" };

const ALIGN: Record<string, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Normaliza para búsqueda: quita acentos, minúsculas, trim. */
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Comparador estable; null/undefined siempre al final sin importar `dir`. */
function compareValues(a: SortValue, b: SortValue, dir: "asc" | "desc"): number {
  const aNil = a == null;
  const bNil = b == null;
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;

  let cmp: number;
  if (a instanceof Date && b instanceof Date) cmp = a.getTime() - b.getTime();
  else if (typeof a === "number" && typeof b === "number") cmp = a - b;
  else cmp = String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });

  return dir === "asc" ? cmp : -cmp;
}

// ── Ícono de orden ─────────────────────────────────────────────────────────────

function SortIcon({ state }: { state: "inactive" | "asc" | "desc" }) {
  if (state === "inactive") {
    return (
      <svg className="w-3 h-3 flex-shrink-0 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4M8 15l4 4 4-4" />
      </svg>
    );
  }
  return (
    <svg className="w-3 h-3 flex-shrink-0 text-fg-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        d={state === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
      />
    </svg>
  );
}

// ── Tabla ──────────────────────────────────────────────────────────────────────

/**
 * Tabla de datos config-driven — layout unificado para los index de los CRUDs.
 * Es dueña del estado de búsqueda y orden: cada columna con `sortValue` es
 * ordenable asc/desc, y `search` activa un buscador estandarizado.
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  search,
  filters,
  action,
  initialSort,
  className,
}: TableProps<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);

  // Sin datos de entrada → estado vacío del consumidor (sin toolbar).
  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  function toggleSort(key: string) {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  // Pipeline: filtrar por búsqueda → ordenar. Nunca muta `rows`.
  let displayed = rows;
  if (search && query.trim()) {
    const q = normalize(query);
    displayed = displayed.filter((r) => normalize(search.getText(r)).includes(q));
  }
  if (sort) {
    const col = columns.find((c) => c.key === sort.key);
    const getVal = col?.sortValue;
    if (getVal) {
      displayed = [...displayed].sort((a, b) => compareValues(getVal(a), getVal(b), sort!.dir));
    }
  }

  const clickable = !!onRowClick;
  const hasToolbar = !!search || !!filters || !!action;

  return (
    <div className={className}>
      {hasToolbar && (
        <SearchFilterBar
          className="mb-6"
          search={
            search
              ? { value: query, onChange: setQuery, placeholder: search.placeholder }
              : undefined
          }
          action={action}
        >
          {filters}
        </SearchFilterBar>
      )}

      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-line bg-surface-hover">
                {columns.map((col) => {
                  const thClass = cn(
                    "px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-fg-muted whitespace-nowrap",
                    ALIGN[col.align ?? "left"],
                    col.width,
                    col.hideOnMobile && "hidden sm:table-cell"
                  );
                  if (!col.sortValue) {
                    return <th key={col.key} className={thClass}>{col.header}</th>;
                  }
                  const active = sort?.key === col.key;
                  return (
                    <th
                      key={col.key}
                      className={thClass}
                      aria-sort={
                        active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-fg-secondary transition-colors",
                          active && "text-fg-secondary",
                          col.align === "right" && "w-full justify-end",
                          col.align === "center" && "w-full justify-center"
                        )}
                      >
                        {col.header}
                        <SortIcon state={active ? sort!.dir : "inactive"} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-12 text-center text-sm text-fg-muted"
                  >
                    {query.trim() ? "Sin resultados para la búsqueda." : "Sin resultados."}
                  </td>
                </tr>
              ) : (
                displayed.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className={cn(
                      "group border-b border-line last:border-0 transition-colors",
                      clickable && "hover:bg-surface-hover/50 cursor-pointer"
                    )}
                    onClick={clickable ? () => onRowClick!(row) : undefined}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick!(row);
                            }
                          }
                        : undefined
                    }
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 py-3 align-middle text-fg-secondary",
                          ALIGN[col.align ?? "left"],
                          col.hideOnMobile && "hidden sm:table-cell"
                        )}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Table.IdentityCell ─────────────────────────────────────────────────────────

interface IdentityCellProps {
  /** Avatar, ícono o caja — el elemento visual a la izquierda. */
  leading?: React.ReactNode;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
}

/** Celda de identidad — ícono/avatar + nombre + línea secundaria truncada. */
function IdentityCell({ leading, primary, secondary }: IdentityCellProps) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {leading}
      <div className="min-w-0">
        <p className="font-medium text-fg truncate">{primary}</p>
        {secondary && <p className="text-xs text-fg-muted truncate">{secondary}</p>}
      </div>
    </div>
  );
}

Table.IdentityCell = IdentityCell;

// ── TableSkeleton ──────────────────────────────────────────────────────────────
// Se mudó a components/ui/Skeleton.tsx (vivía escondida acá y por eso nadie la tomaba
// de modelo, pese a ser el skeleton estructural correcto). Re-export por compatibilidad.
export { TableSkeleton } from './Skeleton';
export type { TableSkeletonProps } from './Skeleton';
