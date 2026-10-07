"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";

// ── Segmentado ─────────────────────────────────────────────────────────────────
//
// Un grupo de opciones EXCLUYENTES que se ven todas a la vez: role="radiogroup", flechas para
// moverse y la selección sigue al foco. Nació en la escala (filtros de vista, industria y perfil)
// y pasó a ser primitiva cuando lo necesitó la exploración de venta para elegir el nivel de cada
// dimensión: un mismo control no puede vivir en dos copias.
//
// `valor` puede ser null: ninguna elegida todavía (el nivel de una dimensión sin estimar). Entonces
// la primera opción habilitada es la que recibe el foco con Tab.
//
// La forma es la del sistema «Nexus · interfaz interna» (2026-10-03), medida por medida: carril
// gris de radio 10 sin borde, opciones de 13 px y la elegida blanca con `shadow-segment`, la única
// sombra de la interfaz. Sirve para dos a cuatro opciones; con más, una lista (`Select`).

export interface OpcionSegmentada<K extends string> {
  clave: K;
  etiqueta: string;
  title?: string;
  /** Se ve pero no se elige (con su `title` explicando por qué). */
  deshabilitada?: boolean;
  /** Cuántas filas deja ver la opción («Mis clientes 23», «Automáticas 0 activas»). En 11 px y gris, después del nombre. */
  cuenta?: number | string;
}

export interface SegmentadoProps<K extends string> {
  opciones: readonly OpcionSegmentada<K>[];
  valor: K | null;
  onCambio: (k: K) => void;
  /** Nombre accesible del grupo. */
  etiqueta: string;
  className?: string;
  /** Mientras se guarda: se ve igual, pero no se puede cambiar. */
  deshabilitado?: boolean;
  /** Ocupa todo el ancho y reparte las opciones en partes iguales (la columna de un tema, en un panel angosto). */
  lleno?: boolean;
}

export function Segmentado<K extends string>({ opciones, valor, onCambio, etiqueta, className, deshabilitado, lleno }: SegmentadoProps<K>) {
  const refs = useRef(new Map<K, HTMLButtonElement>());
  const activas = opciones.filter((o) => !o.deshabilitada);
  const conFoco = valor !== null && opciones.some((o) => o.clave === valor) ? valor : (activas[0]?.clave ?? null);
  const mover = (paso: 1 | -1) => {
    if (activas.length === 0 || deshabilitado) return;
    const i = activas.findIndex((o) => o.clave === valor);
    const sig = activas[i === -1 ? (paso === 1 ? 0 : activas.length - 1) : (i + paso + activas.length) % activas.length];
    onCambio(sig.clave);
    refs.current.get(sig.clave)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      aria-disabled={deshabilitado || undefined}
      className={cn(lleno ? "flex w-full" : "inline-flex max-w-full flex-wrap", "rounded-[10px] bg-surface-hover p-[3px]", className)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          mover(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          mover(-1);
        }
      }}
    >
      {opciones.map((o) => {
        const activo = o.clave === valor;
        return (
          <button
            key={o.clave}
            ref={(el) => {
              if (el) refs.current.set(o.clave, el);
              else refs.current.delete(o.clave);
            }}
            type="button"
            role="radio"
            aria-checked={activo}
            tabIndex={o.clave === conFoco ? 0 : -1}
            title={o.title}
            aria-disabled={o.deshabilitada || undefined}
            onClick={() => !o.deshabilitada && !deshabilitado && onCambio(o.clave)}
            className={cn(
              lleno ? "min-w-0 flex-1 px-1" : "px-4",
              "whitespace-nowrap rounded-lg py-[7px] text-[13px] leading-tight transition-colors",
              activo
                ? "bg-surface font-semibold text-fg shadow-segment"
                : o.deshabilitada
                  ? "cursor-not-allowed text-fg-muted opacity-50"
                  : "text-fg-muted hover:text-fg-secondary",
            )}
          >
            {o.etiqueta}
            {o.cuenta !== undefined && <span className="ml-1 text-[11px] font-normal tabular-nums text-fg-muted">{o.cuenta}</span>}
          </button>
        );
      })}
    </div>
  );
}
