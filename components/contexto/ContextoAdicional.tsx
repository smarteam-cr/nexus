"use client";

/**
 * components/contexto/ContextoAdicional.tsx — el bloque «Contexto adicional» (2026-10-06).
 *
 * Pedido de Elías: el mismo bloque, con el mismo nombre, arriba de cada pieza de la preventa y de los
 * documentos del cliente que lee una IA. Es la cáscara del «Contexto del cronograma» (2026-09-23):
 * una línea plegable que, cerrada, dice con qué va a trabajar la IA; abierta, una explicación, las
 * columnas de lo que se suma (reuniones, fuentes manuales) y las «Instrucciones adicionales».
 *
 * Solo dibuja: cada pieza pone sus columnas y sus instrucciones, que son las que saben dónde se
 * guarda cada cosa. El cuerpo queda montado aunque esté plegado (`hidden`), porque los contadores de
 * la línea cerrada los reportan las columnas. El ancla del recorrido la pone quien lo usa, en un
 * envoltorio (`data-recorrido` escrito literal: así lo encuentra lib/recorridos/recorridos.test.ts).
 */
import type { ReactNode } from "react";

export default function ContextoAdicional({
  abierto,
  onAlternar,
  resumen,
  explicacion,
  children,
}: {
  abierto: boolean;
  onAlternar: () => void;
  /** Lo que se lee con el bloque cerrado: cuántas reuniones, notas, si hay instrucciones. */
  resumen: ReactNode;
  /** Para qué lo usa la IA de esta pieza, en una o dos frases. */
  explicacion?: ReactNode;
  /** Las columnas y las instrucciones adicionales. */
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-hover transition-colors text-left rounded-xl"
      >
        <svg
          className={`w-3.5 h-3.5 text-fg-secondary flex-shrink-0 transition-transform ${abierto ? "" : "-rotate-90"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
        <span className="text-xs font-semibold text-fg flex-shrink-0">
          Contexto adicional
        </span>
        <span className="text-[11px] text-fg-muted truncate">{resumen}</span>
        <span className="ml-auto text-[11px] text-fg-muted flex-shrink-0">
          {abierto ? "Colapsar" : "Expandir"}
        </span>
      </button>
      <div className={abierto ? "px-4 pb-3 space-y-3" : "hidden"}>
        {explicacion ? (
          <p className="text-[11px] text-fg-muted leading-relaxed">
            {explicacion}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
