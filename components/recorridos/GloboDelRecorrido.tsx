"use client";

/**
 * El globo de cada paso de un recorrido (el `tooltipComponent` de React Joyride). Copia el tablero
 * «Recorridos · diseño»: rótulo y «2 de 6», la barra de avance con la forma de la barra de etapas,
 * título de 15 px, texto de 13 px y «Saltar · Anterior · Siguiente». Mientras dura el recorrido,
 * «Siguiente» es el único botón azul de la pantalla.
 *
 * Teclado: → avanza, ← vuelve, Esc sale. La librería encierra el foco en el globo, así que las
 * teclas llegan acá sin escuchar a toda la página.
 */
import type { KeyboardEvent } from "react";
import type { TooltipRenderProps } from "react-joyride";
import { cn } from "@/lib/cn";
import { ROTULO } from "./estilos";

export function GloboDelRecorrido({
  step,
  index,
  size,
  isLastStep,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  controls,
}: TooltipRenderProps) {
  const rotulo = (step.data as { rotulo?: string } | undefined)?.rotulo ?? "Recorrido";

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      controls.next();
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      controls.prev();
    } else if (e.key === "Escape") {
      e.preventDefault();
      controls.skip("button_close");
    }
  };

  return (
    <div
      {...tooltipProps}
      aria-label={`${rotulo}, paso ${index + 1} de ${size}`}
      onKeyDown={alTeclear}
      className="flex w-80 max-w-[calc(100vw-24px)] flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 text-left text-sm leading-[1.45] text-fg shadow-xl"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className={ROTULO}>{rotulo}</p>
        <span className="flex-none text-xs tabular-nums text-fg-muted">
          {index + 1} de {size}
        </span>
      </div>
      <div aria-hidden="true" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {Array.from({ length: size }, (_, i) => (
          <span key={i} className={cn("h-1 rounded-full", i <= index ? "bg-brand" : "bg-line")} />
        ))}
      </div>
      {step.title && <h2 className="text-[15px] font-semibold leading-[1.35] text-fg">{step.title}</h2>}
      <div className="text-[13px] leading-normal text-fg-secondary">{step.content}</div>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          {...skipProps}
          className="rounded py-1 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          Saltar
        </button>
        <span className="flex-1" />
        {index > 0 && (
          <button
            type="button"
            {...backProps}
            className="rounded-md border border-line bg-surface px-3 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          >
            Anterior
          </button>
        )}
        <button
          type="button"
          {...primaryProps}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
        >
          {isLastStep ? "Terminar" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
