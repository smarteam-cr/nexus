/**
 * lib/exploraciones/aviso-de-la-guia.ts — avisarle a la exploración abierta que el chat de Nexus cambió su guía. PURO y
 * client-safe (la parte que toca `window` solo corre en el navegador).
 *
 * CEMACO, 2026-10-20: Liliana le pidió al asistente quitar las preguntas de ventas, el cambio se aplicó y la pantalla
 * siguió mostrando las viejas hasta que recargó (en un proyecto la exploración se pide desde el navegador, así que el
 * `router.refresh()` del chat no la trae). Al aplicar una lista con operaciones de la guía (`guia.*`), el cajón del chat
 * manda un evento del navegador y el lienzo vuelve a leer la exploración (`recargar`): lo que la persona está escribiendo
 * vive en el estado de cada campo y no se pierde.
 */

export const EVENTO_GUIA_CAMBIADA = "exploraciones:guia-cambiada";

/** Cualquier exploración (una operación de la guía sin id: el chat usa la exploración viva de la cuenta). */
export const CUALQUIER_EXPLORACION = "*";

export interface AvisoDeLaGuia {
  /** Las exploraciones cuya guía cambió, o `CUALQUIER_EXPLORACION`. */
  exploraciones: string[];
}

/** El nombre de una operación de la lista del chat (`{ nombre, entrada }`), si lo tiene. */
function nombreDe(o: unknown): string | null {
  if (!o || typeof o !== "object") return null;
  const n = (o as { nombre?: unknown; op?: unknown }).nombre ?? (o as { op?: unknown }).op;
  return typeof n === "string" ? n : null;
}

/**
 * Las exploraciones cuya guía toca lo aplicado de una lista del chat: las operaciones `guia.*` que quedaron marcadas, con
 * su `exploracionId` (sin él, cualquiera). Null si la lista no toca ninguna guía.
 */
export function exploracionesQueTocaLaLista(operaciones: readonly unknown[] | undefined, desmarcadas: readonly number[] = []): string[] | null {
  const fuera = new Set(desmarcadas);
  const ids = new Set<string>();
  (operaciones ?? []).forEach((o, i) => {
    if (fuera.has(i)) return;
    const nombre = nombreDe(o);
    if (!nombre?.startsWith("guia.")) return;
    const entrada = (o as { entrada?: unknown }).entrada;
    const id = entrada && typeof entrada === "object" ? (entrada as { exploracionId?: unknown }).exploracionId : undefined;
    ids.add(typeof id === "string" && id ? id : CUALQUIER_EXPLORACION);
  });
  return ids.size ? [...ids] : null;
}

/** ¿El aviso es para esta exploración? */
export function esParaEstaExploracion(aviso: AvisoDeLaGuia | null | undefined, exploracionId: string): boolean {
  return !!aviso?.exploraciones?.some((id) => id === exploracionId || id === CUALQUIER_EXPLORACION);
}

/** Lo manda el cajón del chat después de aplicar una lista que toca la guía. */
export function avisarQueCambioLaGuia(exploraciones: string[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AvisoDeLaGuia>(EVENTO_GUIA_CAMBIADA, { detail: { exploraciones } }));
}
