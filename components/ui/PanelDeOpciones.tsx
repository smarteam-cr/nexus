"use client";

/**
 * PanelDeOpciones — el panel de un selector: buscador arriba y la lista de opciones, con grupos.
 *
 * Lo comparten `Selector` (el select de un formulario) y `CeldaSelect` (la celda editable de un listado): el panel es
 * uno solo y lo que cambia entre los dos es el botón que lo abre. Pedido de Elías (2026-11-08): «un select sencillo
 * con buscador», igual en todo Nexus, en vez del `<select>` nativo de lista larga.
 *
 * Lo que da, para que ningún selector lo vuelva a resolver por su cuenta:
 *   · **Buscador con el foco puesto al abrir**, limpio cada vez (el panel se monta al abrir). Busca sin tildes.
 *   · **Enter en el buscador elige solo si queda UNA** que se puede elegir; si quedan varias, baja a la primera y ahí
 *     otro Enter la elige. Con el buscador vacío no hace nada. Muchas celdas guardan al elegir (el CSE encargado se
 *     escribe en HubSpot, la empresa de una reunión decide de quién es su texto): un Enter de reflejo al abrir no
 *     puede guardar la primera de la lista (revisión del 2026-11-08). Las flechas recorren; Escape cierra.
 *   · **Grupos con título** (ej. las etapas de una actividad) y una **segunda línea** corta por opción.
 *   · **Marcas a la derecha** («actual», «ya está», «una vez más») y opciones que se ven pero no se eligen.
 *   · **Una búsqueda sin resultados lo DICE**: una lista vacía se lee como «no hay opciones», que es otra cosa.
 *
 * ⚠ La mecánica de abrir y cerrar (posición desde el botón, cierre por clic o scroll afuera, teclado) NO está acá:
 * vive en `usePanelFlotante`. El panel va SIN portal, como el de `CeldaSelect` desde que existe: dentro de un `Modal`
 * o un `Drawer` el foco no puede salir del cuadro, y un buscador en `document.body` quedaría sin poder escribirse.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { zClass } from "@/lib/ui/z";
import { agruparOpciones, filtrarOpciones, type OpcionDeLista } from "@/lib/ui/opciones";

export type { OpcionDeLista };

export interface PanelDeOpcionesProps {
  panelRef: RefObject<HTMLDivElement | null>;
  /** La posición que calcula `usePanelFlotante`. */
  pos: CSSProperties;
  etiqueta: string;
  opciones: OpcionDeLista[];
  /** Los `value` elegidos hoy: se marcan «actual». */
  seleccion?: readonly string[];
  /** El `value` que propone Nexus: se marca «lo propone Nexus». */
  propuesta?: string | null;
  conBuscador: boolean;
  placeholderBusqueda: string;
  /** Mientras se guarda, nada se puede elegir. */
  ocupado?: boolean;
  onElegir: (o: OpcionDeLista) => void;
  /** Qué se dice cuando lo escrito no coincide con nada. */
  sinCoincidencias?: (busqueda: string) => string;
  /** El ancho del panel. */
  ancho?: CSSProperties["width"];
}

export function PanelDeOpciones({
  panelRef,
  pos,
  etiqueta,
  opciones,
  seleccion = [],
  propuesta = null,
  conBuscador,
  placeholderBusqueda,
  ocupado = false,
  onElegir,
  sinCoincidencias = (q) => `Nada coincide con «${q}».`,
  ancho,
}: PanelDeOpcionesProps) {
  const [busqueda, setBusqueda] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  /* El panel se monta al abrir: el buscador arranca limpio y con el foco puesto. */
  useEffect(() => {
    if (conBuscador) inputRef.current?.focus();
  }, [conBuscador]);

  const filtradas = useMemo(() => filtrarOpciones(opciones, busqueda), [opciones, busqueda]);
  const grupos = useMemo(() => agruparOpciones(filtradas), [filtradas]);
  /* En el orden en que se ven (los grupos pueden reordenar la lista que llegó). */
  const elegibles = useMemo(() => grupos.flatMap((g) => g.opciones).filter((o) => !o.deshabilitada), [grupos]);
  const maxAlto = typeof pos.maxHeight === "number" ? `min(22rem, ${pos.maxHeight}px)` : "min(22rem, calc(100vh - 16px))";

  return (
    <div
      ref={panelRef}
      /* ⛔ La fila de un listado suele ser un link: un clic adentro del panel no puede llegar hasta ella. */
      onClick={(e) => e.stopPropagation()}
      /* ⚠ El contenedor scrollea y la lista tiene su propio tope: así `scrollHeight` es el alto que el panel QUIERE, y
         `usePanelFlotante` puede darlo vuelta hacia arriba cuando abajo no cabe. Con un contenedor flex recortado medía
         el alto ya recortado y, al pie de la pantalla, la lista se abría aplastada hacia abajo. */
      className={cn("fixed overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-xl", zClass("POPOVER"))}
      style={{ ...pos, width: ancho, maxWidth: "calc(100vw - 16px)", maxHeight: maxAlto }}
    >
      {conBuscador && (
        <div className="border-b border-line px-2 pb-1.5 pt-0.5">
          <input
            ref={inputRef}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              /* Sin esto el Enter mandaría el formulario de alrededor. */
              e.preventDefault();
              if (!busqueda.trim() || ocupado) return;
              if (elegibles.length === 1) onElegir(elegibles[0]);
              else panelRef.current?.querySelector<HTMLElement>('[role="option"]:not([disabled])')?.focus();
            }}
            placeholder={placeholderBusqueda}
            aria-label={placeholderBusqueda}
            className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:border-brand/50 focus:outline-none"
          />
        </div>
      )}

      <div role="listbox" aria-label={etiqueta} className="overflow-y-auto" style={{ maxHeight: "18rem" }}>
        {opciones.length === 0 ? (
          <p className="px-3 py-2 text-xs text-fg-muted">No hay opciones para elegir.</p>
        ) : filtradas.length === 0 ? (
          <p className="px-3 py-2 text-xs text-fg-muted">{sinCoincidencias(busqueda.trim())}</p>
        ) : (
          grupos.map((g) => (
            <div key={g.grupo ?? ""} role="group" aria-label={g.grupo ?? undefined}>
              {g.grupo && (
                <p aria-hidden="true" className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                  {g.grupo}
                </p>
              )}
              {g.opciones.map((o) => {
                const esActual = seleccion.includes(o.value);
                const esPropuesta = propuesta === o.value;
                const marca = esActual ? "actual" : esPropuesta ? "lo propone Nexus" : o.marca;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={esActual}
                    disabled={ocupado || o.deshabilitada}
                    onClick={() => onElegir(o)}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-sm transition-colors",
                      "hover:bg-surface-hover focus:bg-surface-hover focus:outline-none",
                      "disabled:cursor-default disabled:hover:bg-transparent",
                      o.deshabilitada ? "text-fg-muted" : esActual ? "font-semibold text-fg" : "text-fg-secondary",
                      ocupado && "opacity-60",
                    )}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {marca && (
                        <span className={cn("flex-shrink-0 text-xs font-normal", esPropuesta && !esActual ? "text-brand" : "text-fg-muted")}>
                          {marca}
                        </span>
                      )}
                    </span>
                    {o.hint && <span className="block truncate text-xs font-normal text-fg-muted">{o.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
