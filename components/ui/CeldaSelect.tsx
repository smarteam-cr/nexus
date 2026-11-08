"use client";

/**
 * CeldaSelect — una celda de tabla que se puede EDITAR sin salir del listado.
 *
 * ── PARA QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Nació con la columna «CSE encargado» de `/clients`, y se escribió como primitiva porque el
 * pedido fue explícito: *«estandariza este componente porque me interesa que en el futuro los
 * listing otros puedan ser selects igual»* (Elías, 2026-08-21).
 *
 * Lo que un listado necesita para que una celda sea editable, y que nadie debería volver a
 * resolver por su cuenta:
 *
 *   · **Se ve que es editable** — una flechita. Sin eso nadie descubre que se puede tocar.
 *   · **Buscador cuando hay muchas opciones.** Un equipo de 20 personas ya no entra de un
 *     vistazo, y un scroll de 169 clientes sin buscador ya es una deuda anotada del repo.
 *   · **El clic NO navega.** En casi todos estos listados la fila entera es un link: sin frenar
 *     la propagación, elegir un valor te saca de la lista antes de ver si funcionó.
 *   · **Sin permiso se ve como texto**, no como un control deshabilitado que invita a apretarlo
 *     para descubrir que no se puede.
 *   · **No es optimista.** Estos cambios suelen escribir en un sistema externo (HubSpot) y
 *     pueden fallar a la mitad. Pintar el valor nuevo antes de tiempo muestra como hecho algo
 *     que quizá quedó a medias. Se espera, y el llamador refresca.
 *   · **El error se queda en la celda**, no en un toast: puede ser parcial («se reasignaron 2 de
 *     5»), y esa frase tiene que quedar al lado de la fila que la sufrió.
 *
 * ⚠ La mecánica del desplegable (position:fixed desde el trigger, cierre por scroll externo,
 * teclado) NO está acá: vive en `usePanelFlotante`, compartida con `Menu`. Y el panel (buscador sin
 * tildes, grupos, marcas, Enter que elige la primera) es `PanelDeOpciones`, el mismo de `Selector`, el
 * select de los formularios (2026-11-08): lo que cambia entre los dos es solo el botón.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { PanelDeOpciones, type OpcionDeLista } from "./PanelDeOpciones";
import { usePanelFlotante } from "./usePanelFlotante";
import { IconoDeSugerencia } from "./sistema";

/** Una opción de la celda: valor, nombre y, si hace falta, segunda línea, grupo, marca o deshabilitada. */
export type OpcionDeCelda = OpcionDeLista;

export interface CeldaSelectProps {
  opciones: OpcionDeCelda[];
  /** Los `value` que están seleccionados HOY. Varios = la celda agrega (ej. 2 encargados). */
  seleccion: string[];
  /** Qué se pinta cuando no hay nada seleccionado. */
  vacio?: string;
  /** `false` ⇒ se pinta como texto plano, sin flechita ni desplegable. */
  puedeEditar: boolean;
  /** Tira o devuelve rechazo para que el error se muestre EN la celda. */
  onElegir: (value: string) => Promise<void>;
  /** Para el `aria-label` del trigger: «CSE encargado de Kölbi». */
  etiqueta: string;
  /** Desde cuántas opciones aparece el buscador. Por debajo estorba más de lo que ayuda. */
  minimoParaBuscar?: number;
  placeholderBusqueda?: string;
  /**
   * Lo que propone Nexus cuando no hay nada seleccionado (2026-10-07, la clasificación de la cartera): la celda
   * lo muestra en azul con la chispa, en vez de `vacio`, y en la lista lo marca «· lo propone Nexus». Elegirlo
   * lo confirma. Con algo seleccionado no se usa: lo elegido manda.
   */
  sugerencia?: string;
}

export function CeldaSelect({
  opciones,
  seleccion,
  vacio = "—",
  puedeEditar,
  onElegir,
  etiqueta,
  minimoParaBuscar = 8,
  placeholderBusqueda = "Buscar…",
  sugerencia,
}: CeldaSelectProps) {
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { abierto, setAbierto, alternar, pos, rootRef, btnRef, panelRef } = usePanelFlotante({
    selectorDeItems: '[role="option"]:not([disabled])',
  });

  const conBuscador = opciones.length >= minimoParaBuscar;

  const propuesta = seleccion.length === 0 && sugerencia ? (opciones.find((o) => o.value === sugerencia) ?? null) : null;
  const etiquetaPropuesta = propuesta && (
    <span className="inline-flex max-w-full items-center gap-1 text-brand">
      <IconoDeSugerencia className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">{propuesta.label}</span>
    </span>
  );

  const etiquetaActual =
    seleccion.length === 0 ? null : (
      <>
        {opciones.find((o) => o.value === seleccion[0])?.label ?? seleccion[0]}
        {seleccion.length > 1 && <span className="text-fg-muted"> +{seleccion.length - 1}</span>}
      </>
    );

  /* Sin permiso —o sin nada que ofrecer— la celda es texto. Un control deshabilitado invita a
     apretarlo para descubrir que no se puede. */
  if (!puedeEditar || opciones.length === 0) {
    return etiquetaActual ? (
      <span className="text-fg-secondary truncate block">{etiquetaActual}</span>
    ) : etiquetaPropuesta ? (
      <span className="block truncate">{etiquetaPropuesta}</span>
    ) : (
      <span className="text-fg-muted">{vacio}</span>
    );
  }

  async function elegir(o: OpcionDeCelda) {
    setGuardando(o.value);
    setError(null);
    try {
      await onElegir(o.value);
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : `no se pudo cambiar a ${o.label}`);
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        /* ⛔ La fila entera suele ser un link: sin esto, elegir un valor te saca del listado. */
        onClick={(e) => {
          e.stopPropagation();
          alternar();
        }}
        disabled={guardando !== null}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={etiqueta}
        className="group w-full flex items-center gap-1 text-left rounded px-1 py-0.5 -mx-1 text-fg-secondary hover:bg-surface-hover disabled:opacity-60 transition-colors"
      >
        <span className="truncate flex-1">
          {guardando ? (
            <span className="text-fg-muted">Guardando…</span>
          ) : (
            (etiquetaActual ?? etiquetaPropuesta ?? <span className="text-fg-muted">{vacio}</span>)
          )}
        </span>
        {/* La flechita: lo único que delata que la celda se puede tocar. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={cn(
            "w-3 h-3 flex-shrink-0 text-fg-muted transition-transform",
            abierto && "rotate-180",
          )}
        >
          <path d="M2 4.5 L6 8.5 L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {abierto && pos && (
        /* El buscador (sin tildes: «Elias» encuentra a «Elías», pedido del 2026-08-21) y la lista viven en el panel
           compartido; acá solo se dice qué está elegido y qué propone Nexus. */
        <PanelDeOpciones
          panelRef={panelRef}
          pos={pos}
          etiqueta={etiqueta}
          opciones={opciones}
          seleccion={seleccion}
          propuesta={propuesta?.value ?? null}
          conBuscador={conBuscador}
          placeholderBusqueda={placeholderBusqueda}
          ocupado={guardando !== null}
          onElegir={(o) => void elegir(o)}
          /* ⚠ Se DICE que la búsqueda no encontró nada. Una lista vacía sin explicación se lee como «no hay
             opciones», que es otra cosa. */
          sinCoincidencias={(q) => `Nadie coincide con «${q}».`}
          ancho={256}
        />
      )}

      {error && (
        <p className="absolute z-50 mt-1 w-64 rounded-lg border border-danger-line bg-danger-surface px-2 py-1.5 text-xs text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
