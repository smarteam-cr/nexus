"use client";

/**
 * components/finanzas/QueMide.tsx — el ⓘ de los números de Finanzas: «Qué mide · De dónde sale» (2026-11-13, pedido de
 * Finanzas 10).
 *
 * Al lado de un número, un ⓘ chico. Pasar el mouse, llegar con Tab o tocarlo abre un panel con las dos respuestas que
 * pide quien mira un número de plata: qué es y de qué sistema sale. El texto no se escribe acá: viene de
 * `lib/finanzas/explicaciones.ts`, para que un mismo número diga lo mismo en todas las piezas donde aparece.
 *
 * Para adoptarlo en otra sección: agrega su grupo de explicaciones en ese archivo y pon
 * `<QueMide explicacion={EXPLICACIONES_X.algo} titulo="Algo" />` al lado del número. El panel flota con
 * `usePanelFlotante` (la mecánica de `Menu`): no lo recorta una tabla con scroll ni el borde de la ventana.
 */
import { useId } from "react";
import { cn } from "@/lib/cn";
import { usePanelFlotante } from "@/components/ui";
import type { Explicacion } from "@/lib/finanzas/explicaciones";

export default function QueMide({
  explicacion,
  titulo,
  className,
}: {
  explicacion: Explicacion;
  /** El nombre del número («Facturado»): encabeza el panel y es el nombre accesible del botón. */
  titulo: string;
  className?: string;
}) {
  const id = useId();
  const { abierto, setAbierto, alternar, cerrar, pos, rootRef, btnRef, panelRef } = usePanelFlotante({
    side: "bottom",
    align: "start",
    selectorDeItems: "a",
  });
  const abrir = () => {
    if (!abierto) alternar();
  };
  return (
    <span ref={rootRef} className={cn("inline-flex align-middle", className)} onMouseEnter={abrir} onMouseLeave={cerrar}>
      <button
        ref={btnRef}
        type="button"
        data-sin-tip
        onClick={() => (abierto ? setAbierto(false) : alternar())}
        onFocus={abrir}
        onBlur={cerrar}
        aria-expanded={abierto}
        aria-describedby={abierto ? id : undefined}
        aria-label={`Qué mide y de dónde sale: ${titulo}`}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-fg-muted outline-none hover:text-fg-secondary focus-visible:text-fg-secondary focus-visible:ring-2 focus-visible:ring-brand"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      </button>
      {abierto && pos && (
        <span
          ref={panelRef}
          id={id}
          role="tooltip"
          className="fixed z-50 flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-2 overflow-y-auto rounded-[10px] border border-line bg-surface px-4 py-3 text-left text-[13px] font-normal normal-case leading-[19px] tracking-normal text-fg-secondary shadow-xl"
          style={pos}
        >
          <span className="font-semibold text-fg">{titulo}</span>
          <span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Qué mide</span>
            {explicacion.queMide}
          </span>
          <span className="border-t border-line pt-2">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">De dónde sale</span>
            {explicacion.deDondeSale}
          </span>
        </span>
      )}
    </span>
  );
}
