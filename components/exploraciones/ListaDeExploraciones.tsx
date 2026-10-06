"use client";

/**
 * ListaDeExploraciones — las preventas en curso, como en el tablero del listado (sistema de diseño
 * «Nexus · interfaz interna»): filtros en segmentado y una fila por empresa con qué sigue, cuánto le
 * falta para proponer, la próxima reunión y quién la lleva. Una nueva se abre desde «Planificar con
 * una empresa», debajo, o desde «Llegaron por el test», a la derecha.
 *
 * Segunda vuelta (Elías, 2026-10-05, tablero «Preventa · listado y resumen»): «Qué sigue» en dos
 * renglones (la frase entera y, debajo, las sugeridas); «Para proponer» es una barra ancha con
 * «N de 7 listos» y lo primero que falta, y al pasar el cursor se ven los siete puntos; y la columna
 * «La lleva» elige quién lleva la preventa (components/exploraciones/ElegirResponsable.tsx). La fila
 * entera abre la preventa (el enlace de la empresa se estira); la barra y «La lleva» quedan encima.
 */
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { diaConSemana, haceCuanto } from "@/lib/exploraciones/fechas";
import type { PuntoDeCalidad } from "@/lib/exploraciones/calidad";
import type { FilaDeLaLista } from "@/lib/exploraciones/servidor";
import ElegirResponsable, { type PersonaDelEquipo } from "./ElegirResponsable";
import { IconoDeSugerencia } from "./FranjaDeSugerencias";
import Segmentos from "./Segmentos";

type Filtro = "todas" | "mias" | "listas";

const COLUMNAS = "grid grid-cols-[minmax(0,1.25fr)_minmax(0,1.6fr)_180px_112px_176px] items-start gap-4";

const lista = (f: FilaDeLaLista) => f.total > 0 && f.cumplidos === f.total;

/** Cada punto de «lista para proponer» dicho corto, para «Falta: …» debajo de la barra. */
const CORTO: Record<PuntoDeCalidad["id"], string> = {
  frena: "qué frena al equipo",
  meta: "una meta en cifras",
  tiempos: "para cuándo lo necesita",
  presupuesto: "el presupuesto",
  autoridad: "quién firma",
  consecuencia: "qué pasa si no actúa",
  siguientePaso: "el siguiente paso con fecha",
};

function queFalta(f: FilaDeLaLista): string {
  const faltan = f.puntos.filter((p) => !p.cumplido);
  if (faltan.length === 0) return "";
  const primero = CORTO[faltan[0].id] ?? faltan[0].titulo;
  return faltan.length === 1 ? primero : `${primero} y ${faltan.length - 1} más`;
}

/**
 * La barra de «Para proponer»: un tramo por punto, verde el que está listo. Al pasar el cursor (o
 * llegar con Tab) se ven los siete puntos: va como `title` de varias líneas, que dibuja la capa de
 * tooltips de la app (position: fixed, así no la recorta la tabla con scroll horizontal).
 */
function ParaProponer({ f }: { f: FilaDeLaLista }) {
  const listaYa = lista(f);
  const detalle = ["Lo que pide proponer el land:", ...f.puntos.map((p) => `${p.cumplido ? "✓" : "○"} ${p.titulo}`)].join("\n");
  return (
    <span tabIndex={0} title={detalle} className="relative flex flex-col gap-1.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <span className="flex gap-[3px]" aria-hidden="true">
        {f.puntos.map((p) => (
          <span key={p.id} className={cn("h-2 flex-1 rounded-[3px]", p.cumplido ? "bg-success" : "bg-surface-active")} />
        ))}
      </span>
      <span className="text-xs text-fg-secondary">
        <span className={cn("font-semibold tabular-nums", listaYa ? "text-success-ink" : "text-fg")}>
          {f.cumplidos} de {f.total}
        </span>{" "}
        listos
      </span>
      {!listaYa && f.total > 0 && <span className="text-xs leading-snug text-fg-muted">Falta: {queFalta(f)}</span>}
    </span>
  );
}

export default function ListaDeExploraciones({
  filas,
  miCorreo,
  equipo,
  puedeEditar,
}: {
  filas: FilaDeLaLista[];
  miCorreo: string;
  equipo: PersonaDelEquipo[];
  puedeEditar: boolean;
}) {
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
      <div data-recorrido="preventa.lista.filtros" className="flex flex-wrap items-center justify-between gap-3">
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
        <div className="min-w-[900px]">
          <div className={cn(COLUMNAS, "rounded-t-xl border-b border-line bg-surface-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted")}>
            <span>Empresa</span>
            <span>Qué sigue</span>
            <span>Para proponer</span>
            <span>Próxima reunión</span>
            <span>La lleva</span>
          </div>
          {visibles.length === 0 ? (
            <p className="px-4 py-6 text-sm text-fg-muted">Ninguna preventa con este filtro.</p>
          ) : (
            visibles.map((f, i) => (
              // El recorrido del listado explica la primera fila (lib/recorridos/contenido/preventa.ts).
              <div
                key={f.id}
                data-recorrido={i === 0 ? "preventa.lista.fila" : undefined}
                className={cn(COLUMNAS, "relative p-4 text-fg transition-colors hover:bg-surface-hover", i > 0 && "border-t border-line")}
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  {/* El enlace se estira sobre toda la fila: tocar cualquier parte abre la preventa. */}
                  <Link href={`/sales/exploraciones/${f.id}`} className="text-sm font-semibold leading-snug text-fg after:absolute after:inset-0 after:content-['']">
                    {f.empresa}
                  </Link>
                  <span className="truncate text-xs text-fg-muted">{[f.edicion ?? "Escala general", f.areas.join(" · ")].filter(Boolean).join(" · ")}</span>
                  <span className="text-xs text-fg-muted">Actualizada {haceCuanto(f.actualizadaEn)}</span>
                </span>
                <span data-recorrido={i === 0 ? "preventa.lista.sigue" : undefined} className="flex min-w-0 flex-col items-start gap-1.5">
                  <span
                    className={cn("line-clamp-2 text-[13px] leading-[1.4]", lista(f) ? "font-semibold text-success-ink" : "text-fg")}
                    title={f.queSigue}
                  >
                    {f.queSigue}
                  </span>
                  {f.sugeridas > 0 && (
                    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-info-line bg-info-surface py-px pl-1.5 pr-2 text-[11px] font-semibold text-brand">
                      <IconoDeSugerencia className="h-[13px] w-[13px]" />
                      {f.sugeridas} {f.sugeridas === 1 ? "sugerida" : "sugeridas"}
                    </span>
                  )}
                </span>
                <span data-recorrido={i === 0 ? "preventa.lista.proponer" : undefined} className="min-w-0">
                  <ParaProponer f={f} />
                </span>
                <span className={cn("whitespace-nowrap text-[13px]", f.proximaReunion ? "font-medium text-fg" : "text-warn-ink")}>
                  {f.proximaReunion ? diaConSemana(f.proximaReunion) : "Sin agendar"}
                </span>
                <span data-recorrido={i === 0 ? "preventa.lista.lleva" : undefined} className="relative min-w-0 text-[13px]">
                  <ElegirResponsable
                    exploracionId={f.id}
                    version={f.version}
                    responsableEmail={f.responsableEmail}
                    empresa={f.empresa}
                    equipo={equipo}
                    puedeEditar={puedeEditar}
                  />
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      <p className="text-xs text-fg-muted">«Para proponer» son los {filas[0]?.total || 7} puntos que pide la propuesta del land (un primer proyecto acotado): pasa el cursor por la barra para verlos. Lo más reciente, arriba.</p>
    </section>
  );
}
