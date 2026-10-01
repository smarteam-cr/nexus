"use client";

/**
 * PasoPropuesta — ¿está lista para proponer? Los siete puntos, y desde acá se arma la propuesta.
 *
 * Avisa, no bloquea: el vendedor puede proponer igual. Lo que falta queda a la vista.
 */
import { listaParaProponer } from "@/lib/exploraciones/calidad";
import { cn } from "@/lib/cn";
import { useLienzo } from "./contexto";

export function ListaParaProponer() {
  const { exp, chequeo } = useLienzo();
  const puntos = listaParaProponer(exp.estado, chequeo);
  const cumplidos = puntos.filter((p) => p.cumplido).length;
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg">Lista para proponer</h3>
        <span className="text-xs tabular-nums text-fg-muted">
          {cumplidos} de {puntos.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {puntos.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border text-2xs",
                p.cumplido ? "border-success-line bg-success-surface text-success-ink" : "border-line text-fg-muted",
              )}
              aria-hidden="true"
            >
              {p.cumplido ? "✓" : ""}
            </span>
            <span className={p.cumplido ? "text-fg" : "text-fg-secondary"}>{p.titulo}</span>
            <span className="sr-only">{p.cumplido ? "cumplido" : "falta"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PasoPropuesta() {
  return (
    <div className="space-y-4">
      <ListaParaProponer />
    </div>
  );
}
