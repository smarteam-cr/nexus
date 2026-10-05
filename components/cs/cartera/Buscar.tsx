"use client";

/**
 * El buscador de cuentas de «A quién llamar» y la tabla de las cuentas que coinciden FUERA de esa
 * lista (las sanas, sin nada que reclamar, también se tienen que poder abrir). La lista sale de
 * `cuentasParaBuscar` (lib/cs/cartera-reglas.ts); acá solo se pinta.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";
import { fmtDia, plural } from "@/lib/cs/formato";
import type { CuentaParaBuscar } from "@/lib/cs/cartera-reglas";
import { Avatar, CajaDeTabla, Chip, EncabezadoDeTabla, Flecha, Salud } from "../piezas";

const COLUMNAS = "grid-cols-[minmax(0,1.5fr)_112px_minmax(0,1.6fr)_96px_64px_30px_16px]";

/** El campo de búsqueda (la forma del índice de clientes). Enter y Esc los decide quien lo usa. */
export function CampoDeBusqueda({
  valor,
  onCambio,
  onEnter,
}: {
  valor: string;
  onCambio: (v: string) => void;
  onEnter: () => void;
}) {
  return (
    <label className="flex w-[240px] max-w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-[7px] text-fg-muted">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCambio("");
          if (e.key === "Enter") onEnter();
        }}
        placeholder="Buscar una cuenta…"
        aria-label="Buscar una cuenta de la cartera"
        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-muted"
      />
    </label>
  );
}

/**
 * Las cuentas que coinciden con la búsqueda y no se ven en la lista de arriba. Con un filtro puesto
 * entran también las de la lista que el filtro deja afuera (cada una dice qué le pasa).
 */
export function OtrasCuentas({ cuentas, hoy, conFiltro = false }: { cuentas: readonly CuentaParaBuscar[]; hoy: string; conFiltro?: boolean }) {
  return (
    <section className="space-y-2">
      <p className="text-[13px] font-semibold text-fg">
        Fuera de esta lista · {plural(cuentas.length, "cuenta", "cuentas")}
        <span className="font-normal text-fg-muted">{conFiltro ? " que el filtro deja afuera o sin nada que pida llamar esta semana" : " sin nada que pida llamar esta semana"}</span>
      </p>
      <CajaDeTabla minimo="min-w-[820px]">
        <EncabezadoDeTabla columnas={COLUMNAS}>
          <span>Cuenta</span>
          <span>Salud</span>
          <span>Qué pasa</span>
          <span>Renueva</span>
          <span>Uso</span>
          <span>CSE</span>
          <span />
        </EncabezadoDeTabla>
        {cuentas.map((c, i) => (
          <Link
            key={c.clientId}
            href={`/customer-success/${c.clientId}`}
            className={cn("grid items-center gap-4 px-4 py-3.5 text-fg transition-colors hover:bg-surface-hover", COLUMNAS, i > 0 && "border-t border-line")}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">{c.nombre}</span>
              <span className="text-xs text-fg-muted">
                {c.proyectosActivos > 0 ? plural(c.proyectosActivos, "proyecto activo", "proyectos activos") : "sin proyecto activo"}
              </span>
            </span>
            <Salud salud={c.salud} />
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              {c.principal ? (
                <>
                  <Chip tono={c.salud === "en-riesgo" ? "atencion" : "neutro"}>{c.principal}</Chip>
                  {c.otros > 0 && <span className="text-xs text-fg-muted">y {c.otros} más</span>}
                </>
              ) : (
                <span className="text-[13px] text-fg-muted">Nada que reclamar</span>
              )}
            </span>
            <span className={cn("text-[13px]", c.renueva ? "text-fg" : "text-fg-muted")}>{c.renueva ? fmtDia(c.renueva, hoy) : "sin dato"}</span>
            <span className={cn("text-[13px] tabular-nums", c.uso !== null ? "text-fg" : "text-fg-muted")}>{c.uso !== null ? c.uso : "—"}</span>
            <Avatar nombre={c.cse} />
            <Flecha />
          </Link>
        ))}
      </CajaDeTabla>
    </section>
  );
}
