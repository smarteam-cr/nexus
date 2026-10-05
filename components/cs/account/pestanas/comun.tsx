"use client";

/**
 * components/cs/account/pestanas/comun.tsx — lo que comparten las pestañas de la ficha de una
 * cuenta (rediseño del 2026-10-05): el enlace «Ver … →» que lleva a otra pestaña, la tarjeta de un
 * medidor de cupo y el vacío punteado.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { fraccion, type Cupo } from "@/lib/cs/lectura-partner";
import { miles } from "@/lib/cs/formato";
import type { PestanaDeCuenta } from "@/lib/cs/pestanas-de-la-cuenta";
import { Barra } from "../../piezas";

export type IrA = (pestana: PestanaDeCuenta) => void;

/** «Ver adopción →»: texto azul que cambia de pestaña. */
export function IrAPestana({ a, irA, children }: { a: PestanaDeCuenta; irA: IrA; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => irA(a)}
      className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-brand transition-colors hover:text-brand-light"
    >
      {children}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
        <path d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/** Lo que todavía no existe, dicho en un recuadro punteado. */
export function Vacio({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("rounded-xl border border-dashed border-line bg-surface px-4 py-5 text-[13px] text-fg-muted", className)}>{children}</p>;
}

/** Una tarjeta de cupo: usados de límite, la barra y su nota. */
export function Medidor({ rotulo, cupo, atencion, nota }: { rotulo: string; cupo: Cupo; atencion: boolean; nota: string }) {
  const pct = Math.round(fraccion(cupo) * 100);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <span className={ROTULO_DEL_SISTEMA}>{rotulo}</span>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold tabular-nums text-fg">
          {miles(cupo.usados)} de {miles(cupo.limite)}
        </span>
        <span className={cn("text-[13px]", atencion ? "font-semibold text-warn-ink" : "text-fg-secondary")}>{pct} %</span>
      </span>
      <Barra valor={pct} atencion={atencion} ancho="w-full" />
      {nota && <span className={cn("text-xs", atencion ? "text-warn-ink" : "text-fg-muted")}>{nota}</span>}
    </div>
  );
}

/** Un dato de una tarjeta de pares (etiqueta a la izquierda, valor a la derecha). */
export function Dato({ etiqueta, children, primero }: { etiqueta: string; children: ReactNode; primero?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4 border-t border-line py-2.5 text-[13px]", primero && "mt-2.5")}>
      <span className="text-fg-muted">{etiqueta}</span>
      <span className="text-right text-fg">{children}</span>
    </div>
  );
}
