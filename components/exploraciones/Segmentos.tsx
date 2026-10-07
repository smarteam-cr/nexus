"use client";

/**
 * Segmentos — las subpestañas del sistema de diseño interno (el segmentado de «Nexus · interfaz
 * interna»): carril gris, la opción elegida en blanco y en negrita. Lo usan el «Antes / Después» de
 * una sesión y los filtros del listado, así no se separan.
 *
 * No es `Segmentado` de components/ui: ese es un grupo de radios con otra forma (lo usa la escala),
 * y cambiarlo movería pantallas que no se están rediseñando.
 *
 * `tamano="grande"`: las pestañas de una pieza (los momentos de una sesión), que ordenan toda la
 * pantalla de abajo. Las de 13 px se perdían (Elías, 2026-10-07: «las pestañas internas deben ser
 * más grandes»). Los filtros de una lista siguen en el tamaño normal.
 */
import { cn } from "@/lib/cn";

export interface Segmento<K extends string> {
  clave: K;
  nombre: string;
  /** La cuenta al lado del nombre (los filtros de una lista). */
  cuenta?: number;
  /** No se puede elegir todavía: el porqué va como título (el «Después» de una sesión que no ocurrió). */
  desactivada?: string;
}

export default function Segmentos<K extends string>({
  opciones,
  valor,
  onCambiar,
  etiqueta,
  tamano = "normal",
}: {
  opciones: readonly Segmento<K>[];
  valor: K;
  onCambiar: (k: K) => void;
  /** Nombre accesible del grupo. */
  etiqueta: string;
  tamano?: "normal" | "grande";
}) {
  const grande = tamano === "grande";
  return (
    <div role="tablist" aria-label={etiqueta} className={cn("inline-flex max-w-full flex-wrap bg-surface-hover", grande ? "rounded-xl p-1" : "rounded-[10px] p-[3px]")}>
      {opciones.map((o) => {
        const elegida = valor === o.clave;
        return (
          <button
            key={o.clave}
            type="button"
            role="tab"
            aria-selected={elegida}
            disabled={!!o.desactivada}
            title={o.desactivada}
            onClick={() => onCambiar(o.clave)}
            className={cn(
              "transition-colors disabled:cursor-not-allowed disabled:opacity-45",
              grande ? "rounded-[10px] px-6 py-2.5 text-[15px]" : "rounded-lg px-4 py-[7px] text-[13px]",
              elegida ? "bg-surface font-semibold text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "font-medium text-fg-secondary enabled:hover:text-fg",
            )}
          >
            {o.nombre}
            {o.cuenta !== undefined && <span className={cn("ml-1 font-normal text-fg-muted", grande ? "text-xs" : "text-[11px]")}>{o.cuenta}</span>}
          </button>
        );
      })}
    </div>
  );
}
