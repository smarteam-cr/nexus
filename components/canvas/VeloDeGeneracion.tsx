"use client";

/**
 * components/canvas/VeloDeGeneracion.tsx — EL CARGADOR DE UN DOCUMENTO MIENTRAS SE ESCRIBE: lo tapa entero con la tinta del
 * tema y arriba una franja dice qué está pasando. Salió del cronograma (el bloqueo de CronogramaCanvas, pedido de Elías del
 * 2026-08-21 y el 2026-09-24) y es el mismo en todo artefacto (Elías, 30 oct).
 *
 * El padre pone `relative` y le da `inert` a lo que queda abajo: el velo solo lo hace parecer bloqueado, `inert` es lo que
 * bloquea de verdad.
 *
 * ⛔ SIN `aria-live` ACÁ: `aria-busy` significa «no anuncies todavía», y como este nodo se desmonta al terminar, el anuncio
 * retenido no se dispararía nunca. El anuncio, si hace falta, vive en una región montada siempre.
 */
import { useEffect, useState, type Ref } from "react";

export default function VeloDeGeneracion({ rotulo, detalle, carteRef }: { rotulo: string; detalle: string; carteRef?: Ref<HTMLDivElement> }) {
  return (
    <div className="absolute inset-0 z-[44] cursor-wait" aria-busy="true" onClick={(e) => e.stopPropagation()}>
      {/* `bg-surface/85` es el blanco DEL TEMA, nunca un gris crudo: un gris crudo rompe el modo oscuro. */}
      <div className="absolute inset-0 rounded-2xl bg-surface/85 backdrop-blur-[2px]" />
      {/* ⚠ `sticky`: un documento mide varias pantallas, y un aviso fijo en su borde de arriba quedaría fuera de la vista
          apenas la persona scrollea: un bloqueo cuyo aviso no se ve se lee como la pantalla colgada. La barrita que corre va
          ADENTRO del aviso: afuera la taparía el propio aviso. */}
      <div
        ref={carteRef}
        tabIndex={-1}
        className="sticky top-2 m-2 flex items-center gap-3 overflow-hidden rounded-xl border border-info-line bg-info-surface px-4 py-3 shadow-sm focus:outline-none"
      >
        <span className="w-5 h-5 flex-shrink-0 border-2 border-brand/25 border-t-brand rounded-full animate-spin" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{rotulo}…</p>
          <p className="text-xs text-fg-muted">{detalle}</p>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-0.5">
          {/* El padre fija la altura en `h-0.5`: es una barra de 2 px que recorre el ancho, no un rectángulo esperando contenido. */}
          <div className="skeleton-shimmer h-full w-full" /> {/* slab-ok */}
        </div>
      </div>
    </div>
  );
}

/** El evento con que un botón de generar le avisa a su documento que se está escribiendo. */
const EVENTO = "nexus:documento-generando";

/** Lo dispara `CanvasAgentButton`: al empezar y al terminar la corrida (también si se desmonta a mitad). */
export function avisarGeneracion(activo: boolean) {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { activo } }));
}

/** ¿Se está escribiendo el documento abierto? Lo lee el marco de los documentos de siempre. */
export function useGeneracionDelDocumento(): boolean {
  const [activo, setActivo] = useState(false);
  useEffect(() => {
    const alAvisar = (e: Event) => setActivo(!!(e as CustomEvent<{ activo: boolean }>).detail.activo);
    window.addEventListener(EVENTO, alAvisar);
    return () => window.removeEventListener(EVENTO, alAvisar);
  }, []);
  return activo;
}
