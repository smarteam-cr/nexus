"use client";

/**
 * FranjaDeSugerencias — la franja azul de arriba de una pieza: cuánto sugirió el agente ahí y qué
 * hacer con todo junto (diseño del 2026-10-03). Reemplaza al marco grande de «Hay N propuestas»: la
 * decisión fina se toma en cada fila, en su lugar, o en el cajón «Revisar todo».
 *
 * Acá viven también los tres botones de los tableros de sugerencias, con sus medidas exactas: el azul
 * («Usar»), el blanco con borde («Proponer otra tanda») y el de solo texto («Descartar»).
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function IconoDeSugerencia({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
    </svg>
  );
}

type PropsDeBoton = { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string; className?: string };

/** El botón azul de los tableros: 12 px, seminegrita, esquinas de 6 px. */
export function BotonAzul({ children, onClick, disabled, title, className }: PropsDeBoton) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}

/** El botón blanco con borde de los tableros. */
export function BotonBlanco({ children, onClick, disabled, title, className }: PropsDeBoton) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}

/** El botón de solo texto («Descartar»). */
export function BotonTexto({ children, onClick, disabled, title, className }: PropsDeBoton) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={cn("rounded px-1.5 py-[5px] text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50", className)}>
      {children}
    </button>
  );
}

export default function FranjaDeSugerencias({ children, acciones }: { children: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-info-line bg-info-surface px-3.5 py-2.5">
      <IconoDeSugerencia className="h-[18px] w-[18px] flex-shrink-0 text-brand" />
      <p className="min-w-0 flex-1 text-[13px] text-brand">{children}</p>
      {acciones && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}
