"use client";

/**
 * components/tareas/EtiquetasDeLaTarea.tsx — las etiquetas de una tarea, en su cajón (hasta 5, libres). Agrupan y se
 * buscan; no son estado. Enter agrega; la × quita.
 */
import { useState } from "react";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { MAX_ETIQUETAS } from "@/lib/tareas/reglas";

export function EtiquetasDeLaTarea({ etiquetas, editable, onCambiar }: { etiquetas: string[]; editable: boolean; onCambiar: (etiquetas: string[]) => void }) {
  const [nueva, setNueva] = useState("");
  if (!editable && etiquetas.length === 0) return null;

  function agregar() {
    const e = nueva.trim().replace(/^#/, "").toLowerCase();
    if (!e || etiquetas.includes(e) || etiquetas.length >= MAX_ETIQUETAS) return;
    onCambiar([...etiquetas, e.slice(0, 40)]);
    setNueva("");
  }

  return (
    <div className="space-y-1.5">
      <p className={ROTULO_DEL_SISTEMA}>Etiquetas</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {etiquetas.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-[2px] text-xs text-fg-secondary">
            #{e}
            {editable && (
              <button type="button" aria-label={`Quitar la etiqueta ${e}`} onClick={() => onCambiar(etiquetas.filter((x) => x !== e))} className="text-fg-muted hover:text-fg">
                ×
              </button>
            )}
          </span>
        ))}
        {editable && etiquetas.length < MAX_ETIQUETAS && (
          <input
            value={nueva}
            onChange={(ev) => setNueva(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                agregar();
              }
            }}
            onBlur={agregar}
            maxLength={40}
            placeholder="+ etiqueta"
            aria-label="Nueva etiqueta"
            className="h-7 w-28 rounded-full border border-dashed border-line bg-surface px-2.5 text-xs text-fg outline-none placeholder:text-fg-muted"
          />
        )}
      </div>
    </div>
  );
}
