"use client";

/**
 * useResumenEnLaPagina — lo que la página de La escala sabe del Resumen y el botón «Actualizar con Nexus» de arriba
 * necesita (26 nov): si la escala cambió desde que se armó (`escalaCambio`, la firma de los niveles que calcula el
 * servidor) y si está en el formato del 9 nov. Lo publica PaginaDeLaEscala cada vez que trae la página; el botón lo lee.
 * Uno por exploración, en esta pestaña. Sin página todavía, no sabe nada: `atrasado` false.
 */
import { useSyncExternalStore } from "react";

export interface ResumenEnLaPagina {
  /** Los niveles se movieron después de armarlo. */
  escalaCambio: boolean;
  /** Armado con el formato del 9 nov: rehacerlo lo pasa al resumen ejecutivo. */
  formatoViejo: boolean;
}

const NADA: ResumenEnLaPagina = Object.freeze({ escalaCambio: false, formatoViejo: false });
const valores = new Map<string, ResumenEnLaPagina>();
const oyentes = new Set<() => void>();

/** Lo publica la página al traerse (solo si cambió: cada aviso vuelve a dibujar a quien lo lee). */
export function avisarDelResumenEnLaPagina(exploracionId: string, v: ResumenEnLaPagina): void {
  const antes = valores.get(exploracionId);
  if (antes && antes.escalaCambio === v.escalaCambio && antes.formatoViejo === v.formatoViejo) return;
  valores.set(exploracionId, { escalaCambio: v.escalaCambio, formatoViejo: v.formatoViejo });
  for (const o of oyentes) o();
}

const suscribir = (o: () => void) => {
  oyentes.add(o);
  return () => {
    oyentes.delete(o);
  };
};

export function useResumenEnLaPagina(exploracionId: string): ResumenEnLaPagina {
  return useSyncExternalStore(
    suscribir,
    () => valores.get(exploracionId) ?? NADA,
    () => NADA,
  );
}
