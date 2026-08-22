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
 * teclado) NO está acá: vive en `usePanelFlotante`, compartida con `Menu`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { coincideBusqueda } from "@/lib/ui/text-search";
import { usePanelFlotante } from "./usePanelFlotante";

export interface OpcionDeCelda {
  /** Lo que se manda al confirmar. Único dentro de la lista. */
  value: string;
  label: string;
  /** Segunda línea opcional (ej. el email, para desempatar dos nombres iguales). */
  hint?: string;
}

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
}: CeldaSelectProps) {
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { abierto, setAbierto, alternar, pos, rootRef, btnRef, panelRef } = usePanelFlotante({
    selectorDeItems: '[role="option"]:not([disabled])',
  });

  const conBuscador = opciones.length >= minimoParaBuscar;

  /* El buscador arranca limpio y con el foco puesto cada vez que se abre: reabrirlo con el
     texto de la vez anterior esconde opciones sin que se vea por qué. */
  useEffect(() => {
    if (!abierto) {
      setBusqueda("");
      return;
    }
    if (conBuscador) inputRef.current?.focus();
  }, [abierto, conBuscador]);

  /**
   * ⭐ BUSCA SIN TILDES, EN LOS DOS SENTIDOS: «Elias» encuentra a «Elías» y al revés.
   *
   * Pedido de Elías (2026-08-21) — y es el caso normal, no un borde: media plantilla tiene tilde
   * en el nombre y nadie la escribe al buscar.
   *
   * ⚠ Usa `coincideBusqueda` de `lib/ui/text-search` en vez de un `toLowerCase()` propio, que es
   * como estaba escrito. Ese módulo YA es «el filtrado por texto de las listas, en un solo
   * lugar» y ya normaliza acentos; escribir la comparación de nuevo acá habría sido la copia
   * número 21 del mismo `normalize("NFD")` — hay ~20 en el repo, y ésta al menos tenía dónde
   * apoyarse.
   */
  const filtradas = useMemo(() => {
    const q = busqueda.trim();
    if (!q) return opciones;
    return opciones.filter(
      (o) => coincideBusqueda(o.label, q) || coincideBusqueda(o.hint ?? "", q),
    );
  }, [opciones, busqueda]);

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
            (etiquetaActual ?? <span className="text-fg-muted">{vacio}</span>)
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
        <div
          ref={panelRef}
          role="listbox"
          aria-label={etiqueta}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-60 rounded-xl border border-line bg-surface shadow-xl py-1"
          style={{ ...pos, maxHeight: "min(20rem, calc(100vh - 16px))" }}
        >
          {conBuscador && (
            <div className="px-2 pb-1 border-b border-line">
              <input
                ref={inputRef}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={placeholderBusqueda}
                aria-label={placeholderBusqueda}
                className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-fg placeholder:text-fg-muted"
              />
            </div>
          )}

          <div className="overflow-y-auto" style={{ maxHeight: "16rem" }}>
            {filtradas.length === 0 ? (
              /* ⚠ Se DICE que la búsqueda no encontró nada. Una lista vacía sin explicación se
                 lee como «no hay opciones», que es otra cosa. */
              <p className="px-3 py-2 text-xs text-fg-muted">Nadie coincide con «{busqueda}».</p>
            ) : (
              filtradas.map((o) => {
                const esActual = seleccion.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={esActual}
                    disabled={guardando !== null}
                    onClick={() => void elegir(o)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-surface-hover disabled:opacity-60",
                      esActual ? "font-semibold text-fg" : "text-fg-secondary",
                    )}
                  >
                    <span className="block truncate">
                      {o.label}
                      {esActual && <span className="text-fg-muted"> · actual</span>}
                    </span>
                    {o.hint && <span className="block truncate text-xs text-fg-muted">{o.hint}</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="absolute z-50 mt-1 w-64 rounded-lg border border-danger-line bg-danger-surface px-2 py-1.5 text-xs text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
