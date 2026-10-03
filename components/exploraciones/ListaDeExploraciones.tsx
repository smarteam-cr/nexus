"use client";

/**
 * ListaDeExploraciones — las preventas en curso, como en el tablero del listado (sistema de diseño
 * «Nexus · interfaz interna»): filtros en segmentado, una fila por empresa con qué sigue, cuánto le
 * falta para proponer (una barra por punto de «lista para proponer»), la próxima reunión y cuándo se
 * tocó por última vez. Una nueva se abre desde «Planificar con una empresa», debajo, o desde
 * «Llegaron por el test», a la derecha.
 */
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { diaConSemana, haceCuanto } from "@/lib/exploraciones/fechas";
import type { FilaDeLaLista } from "@/lib/exploraciones/servidor";
import { IconoDeSugerencia } from "./FranjaDeSugerencias";
import Segmentos from "./Segmentos";

type Filtro = "todas" | "mias" | "listas";

const COLUMNAS = "grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.6fr)_150px_120px_96px_20px] items-center gap-4";

const lista = (f: FilaDeLaLista) => f.total > 0 && f.cumplidos === f.total;

/** Lo que va en la columna «Qué sigue»: si es revisar sugerencias, la cuenta la dice la píldora. */
function textoDeQueSigue(f: FilaDeLaLista): string {
  return f.sugeridas > 0 && f.queSigue.startsWith("Revisa lo que sugirió el agente") ? "Revisa lo que sugirió el agente" : f.queSigue;
}

function iniciales(f: FilaDeLaLista): string {
  const base = f.responsableNombre ?? f.responsableEmail?.split("@")[0] ?? "";
  const partes = base.split(/[\s._-]+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "—";
}

export default function ListaDeExploraciones({ filas, miCorreo }: { filas: FilaDeLaLista[]; miCorreo: string }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [q, setQ] = useState("");
  const mia = useCallback((f: FilaDeLaLista) => (f.responsableEmail ?? "").toLowerCase() === miCorreo.toLowerCase(), [miCorreo]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return filas.filter(
      (f) =>
        (filtro === "todas" || (filtro === "mias" && mia(f)) || (filtro === "listas" && lista(f))) &&
        (!t || `${f.empresa} ${f.edicion ?? ""}`.toLowerCase().includes(t)),
    );
  }, [filas, filtro, q, mia]);

  if (filas.length === 0) {
    return (
      <section className="mb-6 space-y-3">
        <h2 className="text-lg font-semibold text-fg">En curso</h2>
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface-muted px-6 py-10 text-center">
          <p className="text-sm font-semibold text-fg">Todavía no hay preventas</p>
          <p className="max-w-[520px] text-[13px] text-fg-muted">
            Una preventa es el lienzo de una empresa: prepara cada reunión con el prospecto y te lleva a la primera propuesta. Empieza por una que llegó
            por el test, a la derecha, o busca cualquier empresa de HubSpot.
          </p>
          <a
            href="#planificar"
            className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          >
            Buscar una empresa en HubSpot
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-fg">En curso</h2>
          <Segmentos
            etiqueta="Filtrar preventas"
            valor={filtro}
            onCambiar={setFiltro}
            opciones={[
              { clave: "todas", nombre: "Todas", cuenta: filas.length },
              { clave: "mias", nombre: "Mías", cuenta: filas.filter(mia).length },
              { clave: "listas", nombre: "Listas para proponer", cuenta: filas.filter(lista).length },
            ]}
          />
        </div>
        <label className="flex w-[260px] max-w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-[7px] text-fg-muted">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar empresa…"
            aria-label="Buscar una preventa por empresa"
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-muted"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <div className="min-w-[760px]">
          <div className={cn(COLUMNAS, "rounded-t-xl border-b border-line bg-surface-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted")}>
            <span>Empresa</span>
            <span>Qué sigue</span>
            <span>Para proponer</span>
            <span>Próxima reunión</span>
            <span className="text-right">Actualizada</span>
            <span />
          </div>
          {visibles.length === 0 ? (
            <p className="px-4 py-6 text-sm text-fg-muted">Ninguna preventa con este filtro.</p>
          ) : (
            visibles.map((f, i) => (
              <Link
                key={f.id}
                href={`/sales/exploraciones/${f.id}`}
                className={cn(COLUMNAS, "px-4 py-3.5 text-fg transition-colors hover:bg-surface-hover", i > 0 && "border-t border-line")}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">{f.empresa}</span>
                  <span className="truncate text-xs text-fg-muted">{[f.edicion ?? "Escala general", f.areas.join(" · ")].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-[13px]",
                      f.sugeridas > 0 ? "text-brand" : lista(f) ? "font-semibold text-success-ink" : "text-fg-secondary",
                    )}
                    title={f.queSigue}
                  >
                    {textoDeQueSigue(f)}
                  </span>
                  {f.sugeridas > 0 && (
                    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-info-line bg-info-surface py-px pl-1.5 pr-2 text-[11px] font-semibold text-brand">
                      <IconoDeSugerencia className="h-[13px] w-[13px]" />
                      {f.sugeridas} {f.sugeridas === 1 ? "sugerida" : "sugeridas"}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2" title={`${f.cumplidos} de ${f.total} puntos de «lista para proponer»`}>
                  <span className="flex gap-[3px]" aria-hidden="true">
                    {Array.from({ length: f.total }, (_, k) => (
                      <span key={k} className={cn("h-1.5 w-3 rounded-full", k < f.cumplidos ? "bg-success" : "bg-surface-active")} />
                    ))}
                  </span>
                  <span className={cn("text-xs tabular-nums", lista(f) ? "font-semibold text-success-ink" : "text-fg-muted")}>
                    {f.cumplidos} de {f.total}
                  </span>
                </span>
                <span className={cn("whitespace-nowrap text-[13px]", f.proximaReunion ? "font-medium text-fg" : "text-warn-ink")}>
                  {f.proximaReunion ? diaConSemana(f.proximaReunion) : "Sin agendar"}
                </span>
                <span className="flex items-center justify-end gap-2 whitespace-nowrap text-xs text-fg-muted">
                  {haceCuanto(f.actualizadaEn)}
                  <span
                    title={f.responsableNombre ?? f.responsableEmail ?? "Sin responsable"}
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-line bg-surface-hover text-[10px] font-semibold text-fg-secondary"
                  >
                    {iniciales(f)}
                  </span>
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-fg-muted" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))
          )}
        </div>
      </div>
      <p className="text-xs text-fg-muted">«Para proponer» son los {filas[0]?.total || 7} puntos que pide una preventa antes de armar la propuesta. Lo más reciente, arriba.</p>
    </section>
  );
}
