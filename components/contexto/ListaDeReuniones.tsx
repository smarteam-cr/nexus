"use client";

/**
 * components/contexto/ListaDeReuniones.tsx — la lista de reuniones de todo «Contexto adicional»
 * (2026-10-09, diseño «Contexto · columna de reuniones»).
 *
 * UNA sola lista para la propuesta, los proyectos (handoff, cronograma y los documentos) y la preventa.
 * Antes cada lugar tenía la suya —cajas grises sueltas, la casilla del navegador, un ícono de Meet por
 * fila y una píldora «Incluida» en cada una— y cada una contaba y decía las cosas a su manera.
 *
 * Arriba, la fila «Elegir todas» (a medias con una raya); con algo elegido se pinta de azul y ofrece
 * «Cancelar» y «Quitar las N». Debajo, la franja de deshacer (Ctrl+Z), la tarjeta con las filas —toda
 * la fila es la etiqueta de su casilla; la X de cada una aparece al pasar el mouse o con el teclado—,
 * el recuadro vacío y las excluidas, plegadas. El enlace «+ Buscar una reunión de Meet» y la cáscara
 * de la columna NO son de acá: son de todas las columnas (EnlaceDeContexto, ContextColumn).
 *
 * Lo propio de cada lugar entra por props: las reuniones ya resueltas (título, línea de datos, estado),
 * cuáles se pueden quitar y la función que escribe. Los textos que dependen de la cuenta y los estados
 * como «punto + texto» salen de lib/contexto/lista-de-reuniones.ts.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  barraDeEleccion,
  textoDeDeshacer,
  textoDeQuitar,
  type EstadoDeReunion,
} from "@/lib/contexto/lista-de-reuniones";
import { useEleccionDeReuniones, type EscribirReuniones, type RestaurarReuniones } from "./useEleccionDeReuniones";

export interface ReunionDeLaLista {
  id: string;
  titulo: string;
  /** La línea de datos: la fecha y, donde el origen varía, el origen («HubSpot · 28 sep»). */
  datos: string;
  estado?: EstadoDeReunion | null;
  /** false = no lleva casilla ni X (en la preventa, las que encontró el agente). Por defecto, sí. */
  quitable?: boolean;
  /** El `title` de la fila (un detalle que no entra en la línea). */
  title?: string;
}

const PUNTO: Record<EstadoDeReunion["tono"], string> = {
  atencion: "bg-warning",
  bien: "bg-success",
  neutro: "bg-fg-muted",
  sinPunto: "",
};
const TEXTO_DEL_ESTADO: Record<EstadoDeReunion["tono"], string> = {
  atencion: "font-medium text-warn-ink",
  bien: "font-medium text-success-ink",
  neutro: "text-fg-muted",
  sinPunto: "text-fg-muted",
};

/**
 * La casilla nuestra: un checkbox REAL (teclado, lector de pantalla, `indeterminate`) sin la apariencia
 * del navegador.
 *
 * ⚠ El cuadro lo dibuja el `span` hermano y no el `input`: app/globals.css le fuerza a TODO `input` del
 * tema claro `background-color`, `border-color` y `color` con `!important` («Inputs / Textareas»), así
 * que una casilla pintada en el propio input quedaría gris claro, elegida o no, justo en el tema por
 * defecto. El input va encima, transparente (la opacidad no la pisa nadie) y recibe el clic y el foco;
 * el `span` copia su estado y su foco con `peer`.
 */
function Casilla({
  marcada,
  parcial = false,
  onCambiar,
  etiqueta,
  className,
}: {
  marcada: boolean;
  parcial?: boolean;
  onCambiar: () => void;
  etiqueta: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = parcial && !marcada;
  }, [parcial, marcada]);
  const encendida = marcada || parcial;
  return (
    <span className={cn("relative h-4 w-4 flex-shrink-0", className)}>
      <input
        ref={ref}
        type="checkbox"
        checked={marcada}
        onChange={onCambiar}
        aria-label={etiqueta}
        className="peer absolute inset-0 z-[1] m-0 h-4 w-4 cursor-pointer appearance-none opacity-0"
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-[4px] border-[1.5px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
          encendida ? "border-primary bg-primary" : "border-fg-muted bg-surface",
        )}
      />
      {encendida && (
        <svg
          className="pointer-events-none absolute left-0.5 top-0.5 text-primary-fg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d={marcada ? "M5 12.5l4.5 4.5L19 7.5" : "M6 12h12"} />
        </svg>
      )}
    </span>
  );
}

function LineaDeDatos({ datos, estado }: { datos: string; estado?: EstadoDeReunion | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs leading-4 text-fg-muted">
      {datos && <span className="truncate">{datos}</span>}
      {estado && (
        <span className={cn("inline-flex flex-shrink-0 items-center gap-[5px]", TEXTO_DEL_ESTADO[estado.tono])} title={estado.detalle}>
          {estado.tono !== "sinPunto" && <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", PUNTO[estado.tono])} />}
          {estado.texto}
        </span>
      )}
    </span>
  );
}

export default function ListaDeReuniones({
  reuniones,
  excluidas = [],
  puedeEditar,
  escribir,
  restaurar,
  onBuscar,
  vacio,
  etiquetaQuitar = (titulo) => `Quitar «${titulo}»`,
  tituloQuitar = "Quitar",
  minimoParaElegir = 1,
  cargando = false,
}: {
  reuniones: ReunionDeLaLista[];
  /** Las que se sacaron a mano y siguen a la vista (los proyectos): van plegadas, con «Volver a incluir». */
  excluidas?: ReunionDeLaLista[];
  puedeEditar: boolean;
  /** Quita (`incluir` false) o devuelve (`incluir` true) reuniones. Cada lugar le pasa su ruta. */
  escribir: EscribirReuniones;
  /** Deshacer: deja lo quitado como estaba. Sin esto, devuelve con `escribir(ids, true)`. */
  restaurar?: RestaurarReuniones;
  /** «Vaciar y buscar»: después de vaciar, abre el buscador. Sin esto, el botón no aparece. */
  onBuscar?: () => void;
  /** El texto de la lista vacía (el que ya tiene cada lugar). */
  vacio: string;
  etiquetaQuitar?: (titulo: string) => string;
  /** El `title` de la X de cada fila («Sacar de esta propuesta»). */
  tituloQuitar?: string;
  /** Cuántas quitables hacen falta para mostrar «Elegir todas» (la preventa pide 2). */
  minimoParaElegir?: number;
  cargando?: boolean;
}) {
  const quitables = puedeEditar ? reuniones.filter((r) => r.quitable !== false).map((r) => r.id) : [];
  const e = useEleccionDeReuniones({ ids: quitables, escribir, restaurar });
  const [verExcluidas, setVerExcluidas] = useState(false);
  const [volviendo, setVolviendo] = useState<string | null>(null);

  const n = e.elegidas.length;
  const barra = barraDeEleccion(n, quitables.length);
  const eligiendo = n > 0;
  /* La fila de arriba y las casillas van juntas: sin la fila no hay qué hacer con lo elegido (la
     preventa con una sola reunión que se puede quitar), y ahí queda solo la X. */
  const conBarra = puedeEditar && quitables.length >= Math.max(1, minimoParaElegir);
  const hayCasillas = conBarra;

  const volverAIncluir = async (id: string) => {
    setVolviendo(id);
    try {
      await e.devolver([id]);
    } finally {
      setVolviendo(null);
    }
  };

  if (cargando) return <div className="h-12 rounded-lg skeleton-shimmer" />;

  return (
    <div ref={e.contenedor} className="flex flex-col gap-2">
      {/* ── La fila de arriba: siempre a la vista; el borde transparente evita el salto al elegir ── */}
      {conBarra && (
        <div
          className={cn(
            "flex h-9 items-center justify-between gap-2 rounded-lg border pl-2.5 pr-1.5",
            eligiendo ? "border-info-line bg-info-surface" : "border-transparent",
          )}
        >
          <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
            <Casilla
              marcada={barra.casilla === "llena"}
              parcial={barra.casilla === "parcial"}
              onCambiar={e.alternarTodas}
              etiqueta={barra.etiqueta}
            />
            <span className={cn("whitespace-nowrap text-xs leading-4", eligiendo ? "font-semibold text-fg" : "font-medium text-fg-secondary")}>
              {barra.rotulo}
            </span>
          </label>
          {eligiendo ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={e.soltar}
                disabled={e.trabajando}
                className="px-2 py-1 text-xs font-medium text-fg-muted hover:underline disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void e.quitar(e.elegidas)}
                disabled={e.trabajando}
                className="inline-flex h-[26px] items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-fg-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
                {textoDeQuitar(n)}
              </button>
            </div>
          ) : (
            onBuscar && (
              <button
                type="button"
                onClick={() => void e.quitar(quitables).then((ok) => ok && onBuscar())}
                disabled={e.trabajando}
                className="px-1.5 py-1 text-xs font-semibold text-brand hover:underline disabled:opacity-50"
              >
                Vaciar y buscar
              </button>
            )
          )}
        </div>
      )}

      {/* ── La franja de deshacer ── */}
      {puedeEditar && e.ultimo && (
        <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-line bg-surface pl-3 pr-1.5">
          <span className="text-xs text-fg-secondary">{textoDeDeshacer(e.ultimo.length)}</span>
          <button
            type="button"
            onClick={() => void e.deshacer()}
            disabled={e.trabajando}
            className="inline-flex items-center gap-1.5 px-1.5 py-1 text-xs font-semibold text-brand hover:underline disabled:opacity-50"
          >
            Deshacer
            <kbd className="rounded border border-line bg-surface-muted px-1 font-sans text-[11px] font-medium leading-4 text-fg-muted">Ctrl+Z</kbd>
          </button>
        </div>
      )}

      {/* ── La lista (o el vacío) ── */}
      {reuniones.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-xs leading-[18px] text-fg-muted">{vacio}</div>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-line bg-surface">
          {reuniones.map((r, i) => {
            const quitable = puedeEditar && r.quitable !== false;
            const conCasilla = hayCasillas && quitable;
            const elegida = conCasilla && e.esElegida(r.id);
            const texto = (
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium leading-5 text-fg">{r.titulo}</span>
                <LineaDeDatos datos={r.datos} estado={r.estado} />
              </span>
            );
            return (
              <div
                key={r.id}
                title={r.title}
                className={cn(
                  "group flex items-center gap-1 pr-1.5",
                  i > 0 && "border-t border-line",
                  elegida ? "bg-info-surface" : "bg-surface hover:bg-surface-hover",
                )}
              >
                {conCasilla ? (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 py-[9px] pl-2.5">
                    <Casilla marcada={elegida} onCambiar={() => e.alternar(r.id)} etiqueta={`Elegir «${r.titulo}»`} className="mt-0.5" />
                    {texto}
                  </label>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start gap-2.5 py-[9px] pl-2.5">
                    {/* Sin casilla, el hueco de 16 px deja los títulos alineados con los que sí la tienen. */}
                    {hayCasillas && <span aria-hidden className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                    {texto}
                  </div>
                )}
                {quitable && (
                  <button
                    type="button"
                    onClick={() => void e.quitar([r.id])}
                    disabled={e.trabajando}
                    aria-label={etiquetaQuitar(r.titulo)}
                    title={tituloQuitar}
                    className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-fg-muted opacity-0 transition-opacity hover:bg-surface-active hover:text-fg focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 disabled:cursor-default [@media(hover:none)]:opacity-100"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Las excluidas: siguen existiendo, plegadas ── */}
      {excluidas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setVerExcluidas((v) => !v)}
            aria-expanded={verExcluidas}
            className="inline-flex items-center gap-1 self-start text-xs font-medium text-fg-muted hover:text-fg"
          >
            <svg
              className={cn("h-3 w-3 transition-transform", verExcluidas ? "rotate-90" : "")}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            {`Excluidas (${excluidas.length})`}
          </button>
          {verExcluidas && (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-line bg-surface">
              {excluidas.map((r, i) => (
                <div key={r.id} title={r.title} className={cn("flex items-center gap-2 py-[9px] pl-2.5 pr-2", i > 0 && "border-t border-line")}>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 opacity-60">
                    <span className="truncate text-[13px] font-medium leading-5 text-fg">{r.titulo}</span>
                    <LineaDeDatos datos={r.datos} estado={r.estado} />
                  </span>
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => void volverAIncluir(r.id)}
                      disabled={volviendo !== null || e.trabajando}
                      className="flex-shrink-0 text-xs font-semibold text-brand hover:underline disabled:opacity-50"
                    >
                      Volver a incluir
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
