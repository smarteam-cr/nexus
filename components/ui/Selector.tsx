"use client";

/**
 * Selector — el select de Nexus: un botón que abre un panel con buscador, grupos y marcas.
 *
 * Reemplaza al `<select>` nativo (pedido de Elías, 2026-11-08: «un select sencillo con buscador», igual en todo
 * Nexus). El nativo de una lista larga —las actividades de la biblioteca, con sus etapas— no se puede buscar, no
 * dice qué opción ya está ni por qué, y se ve distinto en cada navegador.
 *
 * Dos usos:
 *   · **Elegir un valor** (`valor` + `onElegir`): el botón muestra lo elegido.
 *   · **Elegir para hacer algo** (sin `valor`): el botón muestra siempre el `placeholder` («Agregar una actividad…»)
 *     y elegir dispara la acción.
 *
 * El panel es `PanelDeOpciones`, el mismo de `CeldaSelect` (la celda editable de un listado); la mecánica de abrir y
 * cerrar es `usePanelFlotante`, la misma de `Menu`. Si `onElegir` devuelve una promesa, el selector espera y, si
 * falla, deja el error debajo.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useFieldContext } from "./Field";
import { PanelDeOpciones, type OpcionDeLista } from "./PanelDeOpciones";
import { usePanelFlotante } from "./usePanelFlotante";

export type OpcionDeSelector = OpcionDeLista;

export interface SelectorProps {
  opciones: OpcionDeSelector[];
  /** El `value` elegido hoy. Sin `valor`, el botón muestra el `placeholder` (elegir es una acción, no un valor). */
  valor?: string | null;
  /** Lo que dice el botón cuando no hay nada elegido. */
  placeholder: string;
  onElegir: (value: string) => void | Promise<void>;
  /** Para el `aria-label` del botón y de la lista. */
  etiqueta: string;
  disabled?: boolean;
  /** Desde cuántas opciones aparece el buscador. Por debajo estorba más de lo que ayuda. */
  minimoParaBuscar?: number;
  placeholderBusqueda?: string;
  /** Qué se dice cuando lo escrito no coincide con nada. */
  sinCoincidencias?: (busqueda: string) => string;
  className?: string;
}

/** El panel nunca es más angosto que esto, ni más ancho que lo otro, aunque el botón ocupe toda la fila. */
const ANCHO_MINIMO = 256;
const ANCHO_MAXIMO = 448;

export function Selector({
  opciones,
  valor = null,
  placeholder,
  onElegir,
  etiqueta,
  disabled = false,
  minimoParaBuscar = 8,
  placeholderBusqueda = "Buscar…",
  sinCoincidencias,
  className,
}: SelectorProps) {
  const field = useFieldContext();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ancho, setAncho] = useState(ANCHO_MINIMO);
  const { abierto, setAbierto, alternar, pos, rootRef, btnRef, panelRef } = usePanelFlotante({
    selectorDeItems: '[role="option"]:not([disabled])',
  });

  const elegida = valor ? opciones.find((o) => o.value === valor) : undefined;

  async function elegir(o: OpcionDeLista) {
    setError(null);
    let r: void | Promise<void>;
    try {
      r = onElegir(o.value);
    } catch (e) {
      setError(e instanceof Error ? e.message : `No se pudo elegir «${o.label}».`);
      return;
    }
    if (!(r instanceof Promise)) {
      setAbierto(false);
      btnRef.current?.focus();
      return;
    }
    setOcupado(true);
    try {
      await r;
      setAbierto(false);
      btnRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : `No se pudo elegir «${o.label}».`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        id={field?.id}
        aria-describedby={field?.describedBy}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={etiqueta}
        disabled={disabled || ocupado}
        onClick={() => {
          const w = btnRef.current?.offsetWidth ?? ANCHO_MINIMO;
          setAncho(Math.min(ANCHO_MAXIMO, Math.max(ANCHO_MINIMO, w)));
          alternar();
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-line bg-surface-hover px-3 py-2 text-left text-sm transition-colors",
          "hover:border-brand/40 focus:border-brand/50 focus:outline-none disabled:opacity-60",
          abierto && "border-brand/50",
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", elegida ? "text-fg" : "text-fg-secondary")}>
          {ocupado ? "Guardando…" : (elegida?.label ?? placeholder)}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={cn("h-3 w-3 flex-shrink-0 text-fg-muted transition-transform", abierto && "rotate-180")}
        >
          <path d="M2 4.5 L6 8.5 L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {abierto && pos && (
        <PanelDeOpciones
          panelRef={panelRef}
          pos={pos}
          etiqueta={etiqueta}
          opciones={opciones}
          seleccion={elegida ? [elegida.value] : []}
          conBuscador={opciones.length >= minimoParaBuscar}
          placeholderBusqueda={placeholderBusqueda}
          ocupado={ocupado}
          onElegir={(o) => void elegir(o)}
          sinCoincidencias={sinCoincidencias}
          ancho={ancho}
        />
      )}

      {error && <p className="mt-1 text-xs text-danger-ink">{error}</p>}
    </div>
  );
}
