"use client";

/**
 * FranjaDeSugerencias — la franja azul de arriba de una pieza: cuánto sugirió el agente ahí y qué
 * hacer con todo junto (diseño del 2026-10-03). Reemplaza al marco grande de «Hay N propuestas»: la
 * decisión fina se toma en cada fila, en su lugar, o en el cajón «Revisar todo».
 */
import type { ReactNode } from "react";

export function IconoDeSugerencia({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
    </svg>
  );
}

export default function FranjaDeSugerencias({ children, acciones }: { children: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-info-line bg-info-surface px-3.5 py-2.5">
      <IconoDeSugerencia className="h-4 w-4 flex-shrink-0 text-brand" />
      <p className="min-w-0 flex-1 text-sm text-brand">{children}</p>
      {acciones && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}
