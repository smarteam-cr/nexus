"use client";

/**
 * Segmentos — las subpestañas del sistema de diseño interno (el segmentado de «Nexus · interfaz
 * interna»): carril gris, la opción elegida en blanco y en negrita. Lo usan el «Antes / Después» de
 * una sesión y los filtros del listado, así no se separan.
 *
 * No es `Segmentado` de components/ui: ese es un grupo de radios con otra forma (lo usa la escala),
 * y cambiarlo movería pantallas que no se están rediseñando.
 */
import { cn } from "@/lib/cn";

export interface Segmento<K extends string> {
  clave: K;
  nombre: string;
  /** La cuenta al lado del nombre (los filtros de una lista). */
  cuenta?: number;
}

export default function Segmentos<K extends string>({
  opciones,
  valor,
  onCambiar,
  etiqueta,
}: {
  opciones: readonly Segmento<K>[];
  valor: K;
  onCambiar: (k: K) => void;
  /** Nombre accesible del grupo. */
  etiqueta: string;
}) {
  return (
    <div role="tablist" aria-label={etiqueta} className="inline-flex max-w-full flex-wrap rounded-[10px] bg-surface-hover p-[3px]">
      {opciones.map((o) => {
        const elegida = valor === o.clave;
        return (
          <button
            key={o.clave}
            type="button"
            role="tab"
            aria-selected={elegida}
            onClick={() => onCambiar(o.clave)}
            className={cn(
              "rounded-lg px-4 py-[7px] text-[13px] transition-colors",
              elegida ? "bg-surface font-semibold text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "font-medium text-fg-secondary hover:text-fg",
            )}
          >
            {o.nombre}
            {o.cuenta !== undefined && <span className="ml-1 text-[11px] font-normal text-fg-muted">{o.cuenta}</span>}
          </button>
        );
      })}
    </div>
  );
}
