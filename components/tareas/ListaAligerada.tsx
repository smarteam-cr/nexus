"use client";

/**
 * components/tareas/ListaAligerada.tsx — una lista de tareas con lo rápido aparte (DECISIONS «Tareas internas…» ›
 * «Menos tareas a la vista»). El trabajo se ve entero; lo rápido y los seguimientos (`claseDeTrabajo`) van al final en
 * un renglón plegado, y adentro, por cuenta. Es solo la vista: cada tarea sigue con su fila y su casilla.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { agruparRapidas } from "@/lib/tareas/aligerar";
import type { TareaVista } from "@/lib/tareas/tipos";

function Flecha({ abierta }: { abierta: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-3.5 w-3.5 flex-shrink-0 text-fg-muted transition-transform", abierta && "rotate-90")} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function ListaAligerada({ tareas, fila, vacio }: { tareas: readonly TareaVista[]; fila: (t: TareaVista) => React.ReactNode; vacio?: string }) {
  const [abierta, setAbierta] = useState(false);
  const { trabajo, ligeras, cuantasLigeras } = agruparRapidas(tareas);
  if (!tareas.length) return vacio ? <p className="px-4 py-4 text-[13px] text-fg-muted">{vacio}</p> : null;
  const cuentas = ligeras.filter((g) => g.clave).length;
  return (
    <ul className="divide-y divide-line">
      {trabajo.map((t) => fila(t))}
      {cuantasLigeras > 0 && (
        <li>
          <button
            type="button"
            aria-expanded={abierta}
            onClick={() => setAbierta((x) => !x)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover"
          >
            <Flecha abierta={abierta} />
            <span className="text-[13px] font-medium text-fg-secondary">Rápidas y seguimientos</span>
            <span className="text-xs tabular-nums text-fg-muted">
              {cuantasLigeras}
              {cuentas > 1 ? ` en ${cuentas} cuentas` : cuentas === 1 && ligeras[0]?.cuenta ? ` · ${ligeras[0].cuenta}` : ""}
            </span>
            <span className="ml-auto hidden text-xs text-fg-muted sm:inline">Enviar, confirmar, recordarle al cliente</span>
          </button>
          {abierta && (
            <div className="border-t border-line bg-surface-muted">
              {ligeras.map((g) => (
                <div key={g.clave || "sin-cuenta"}>
                  {ligeras.length > 1 && (
                    <p className="px-4 pb-1 pt-2.5 text-xs font-medium text-fg-muted">
                      {g.cuenta ?? "Sin cuenta"} · {g.tareas.length}
                    </p>
                  )}
                  <ul className="divide-y divide-line">{g.tareas.map((t) => fila(t))}</ul>
                </div>
              ))}
            </div>
          )}
        </li>
      )}
    </ul>
  );
}
