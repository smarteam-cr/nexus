"use client";

import { cn } from "@/lib/cn";

// ── Interruptor ────────────────────────────────────────────────────────────────
//
// Prende o apaga algo que sigue andando solo (role="switch"): una pregunta de tiempo que se hace o no se
// hace. Nació en Feedback › Encuestas (2026-10-06, diseño «Feedback · rediseño completo»). No es para
// elegir entre opciones (eso es `Segmentado`) ni para marcar filas de una lista (eso es una casilla).
//
// El estado se dice también en palabras al lado (`texto`), nunca solo con el color: el carril azul es
// «activo» y el gris, «pausado».

export interface InterruptorProps {
  activo: boolean;
  onCambio: (activo: boolean) => void;
  /** Nombre accesible: qué se prende o se apaga. */
  etiqueta: string;
  /** La palabra que va al lado («Activa», «Pausada»). Sin ella, solo el carril. */
  texto?: string;
  deshabilitado?: boolean;
  title?: string;
  className?: string;
}

export function Interruptor({ activo, onCambio, etiqueta, texto, deshabilitado, title, className }: InterruptorProps) {
  return (
    <span className={cn("inline-flex flex-none items-center gap-2", deshabilitado && "opacity-50", className)} title={title}>
      {texto && <span className="whitespace-nowrap text-xs text-fg-secondary">{texto}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={etiqueta}
        disabled={deshabilitado}
        onClick={() => onCambio(!activo)}
        className={cn(
          "relative h-5 w-[34px] flex-none rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed",
          activo ? "bg-primary" : "bg-fg-muted/40",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-primary-fg shadow-segment transition-transform", activo && "translate-x-[14px]")}
        />
      </button>
    </span>
  );
}
