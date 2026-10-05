"use client";

/**
 * components/propuestas/PasosDeLaPropuesta.tsx — la barra de pasos de la ficha de una propuesta
 * (rediseño del 2026-10-05): Contexto · Propuesta · Compartir, cada uno con un punto de color y
 * una línea de en qué está, y abajo a qué está enlazada (el trato de HubSpot, la preventa).
 *
 * El punto dice si hay algo que hacer: verde = al día, ámbar = falta algo o hay cambios sin subir,
 * azul = el agente está trabajando, rojo = falló, gris = todavía no empieza.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";

export type PasoDeLaPropuesta = "contexto" | "propuesta" | "compartir";
export type TonoDelPaso = "listo" | "pendiente" | "trabajando" | "fallo" | "vacio";

const PUNTO: Record<TonoDelPaso, string> = {
  listo: "bg-success",
  pendiente: "bg-warning",
  trabajando: "bg-primary animate-pulse",
  fallo: "bg-destructive",
  vacio: "border border-line bg-surface",
};

export interface EstadoDelPaso {
  nota: string;
  tono: TonoDelPaso;
}

export default function PasosDeLaPropuesta({
  paso,
  onPaso,
  estados,
  tratoUrl,
  preventa,
}: {
  paso: PasoDeLaPropuesta;
  onPaso: (p: PasoDeLaPropuesta) => void;
  estados: Record<PasoDeLaPropuesta, EstadoDelPaso>;
  tratoUrl: string | null;
  /** La preventa que usa (con enlace), o cuántas hay sin usar en la empresa. */
  preventa: { usadaId: string | null; sinUsar: number } | null;
}) {
  const pasos: { clave: PasoDeLaPropuesta; titulo: string }[] = [
    { clave: "contexto", titulo: "1 · Contexto" },
    { clave: "propuesta", titulo: "2 · Propuesta" },
    { clave: "compartir", titulo: "3 · Compartir" },
  ];
  return (
    <nav
      aria-label="Pasos de la propuesta"
      className="flex w-full flex-shrink-0 flex-col gap-1 border-b border-line bg-surface px-3 py-4 lg:w-[232px] lg:border-b-0 lg:border-r"
    >
      {pasos.map(({ clave, titulo }) => {
        const activo = paso === clave;
        const e = estados[clave];
        return (
          <button
            key={clave}
            type="button"
            onClick={() => onPaso(clave)}
            aria-current={activo ? "step" : undefined}
            className={cn(
              "flex gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
              activo ? "border-info-line bg-info-surface" : "border-transparent hover:bg-surface-hover",
            )}
          >
            <span aria-hidden className={cn("mt-1.5 h-2 w-2 flex-shrink-0 rounded-full", PUNTO[e.tono])} />
            <span className="flex min-w-0 flex-col">
              <span className={cn("text-[13px] font-semibold", activo ? "text-brand" : "text-fg")}>{titulo}</span>
              <span className="truncate text-xs text-fg-muted">{e.nota}</span>
            </span>
          </button>
        );
      })}

      <div className="mx-1 mb-2 mt-3 border-t border-line" />
      <span className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Enlazada a</span>
      {tratoUrl ? (
        <a href={tratoUrl} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 text-[13px] text-brand hover:text-brand-dark">
          Trato en HubSpot ↗
        </a>
      ) : (
        <span className="px-2.5 py-1.5 text-[13px] text-fg-muted">Sin trato de HubSpot</span>
      )}
      {preventa?.usadaId ? (
        <Link href={`/sales/exploraciones/${preventa.usadaId}`} className="px-2.5 py-1.5 text-[13px] text-brand hover:text-brand-dark">
          Su preventa ↗
        </Link>
      ) : preventa && preventa.sinUsar > 0 ? (
        <button type="button" onClick={() => onPaso("contexto")} className="px-2.5 py-1.5 text-left text-[13px] text-warn-ink hover:underline">
          Sin preventa · hay {preventa.sinUsar === 1 ? "una" : preventa.sinUsar} sin usar
        </button>
      ) : (
        <span className="px-2.5 py-1.5 text-[13px] text-fg-muted">Sin preventa</span>
      )}
    </nav>
  );
}
