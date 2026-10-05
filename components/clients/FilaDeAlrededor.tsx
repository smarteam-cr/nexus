"use client";

/**
 * components/clients/FilaDeAlrededor.tsx — una fila plegable de «Alrededor del handoff» (rediseño de
 * la ficha, 2026-10-04, sistema «Nexus · interfaz interna»).
 *
 * Contexto del handoff, Resultados que persigue el cliente, Pedidos fuera de alcance y Exclusiones
 * tenían cada uno su propia cabecera —tamaños, flechas y contadores distintos— dentro de la misma
 * tarjeta. Ahora las cuatro se leen igual: el título, una línea de qué es, a la derecha lo que pide
 * atención (en ámbar) o solo la cuenta (en gris), y la flecha.
 *
 * El cuerpo se OCULTA, no se desmonta: los contadores, los borradores y lo que cada sección ya
 * cargó sobreviven al pliegue.
 */
import type { ReactNode } from "react";

export function FilaDeAlrededor({
  titulo,
  ayuda,
  meta,
  metaTono = "neutro",
  abierto,
  onAlternar,
  children,
}: {
  titulo: string;
  ayuda: string;
  meta?: ReactNode;
  /** `atencion` = hay algo que decidir (ámbar); `neutro` = solo la cuenta (gris). */
  metaTono?: "atencion" | "neutro";
  abierto: boolean;
  onAlternar: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-hover"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-fg">{titulo}</span>
          <span className="text-xs text-fg-muted">{ayuda}</span>
        </span>
        {meta && (
          <span
            className={
              metaTono === "atencion"
                ? "flex-shrink-0 text-xs font-semibold text-warn-ink"
                : "flex-shrink-0 text-xs text-fg-muted"
            }
          >
            {meta}
          </span>
        )}
        <svg
          className={`h-3.5 w-3.5 flex-shrink-0 text-fg-muted transition-transform ${abierto ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div hidden={!abierto} className="px-4 pb-4">
        {children}
      </div>
    </div>
  );
}
