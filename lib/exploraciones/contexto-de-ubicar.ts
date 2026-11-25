/**
 * lib/exploraciones/contexto-de-ubicar.ts — qué proyecto se lee como contexto al ubicar La escala de la preventa de un
 * cliente («Con el contexto de», 24 nov), compartido por los dos botones que lanzan «Ubicar» (25 nov): el de la línea de
 * debajo de la página y el «Volver a ubicar» del aviso de arriba del Resumen. PURO y client-safe.
 *
 * Un almacén por exploración, fuera de los componentes: lo que se elige abajo es lo que usa el botón de arriba. Es de esta
 * pestaña (al recargar vuelve el sugerido), como era el estado de la línea antes. Lo lee el hook
 * components/exploraciones/useUbicarLaEscala.ts con `useSyncExternalStore`.
 */

/** El proyecto elegido por exploración. Sin entrada: el sugerido; `null`: «Sin un proyecto». */
const elegidos = new Map<string, string | null>();
const oyentes = new Set<() => void>();

export function suscribirseAlContexto(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Lo que se eligió en esta exploración: un id, `null` («Sin un proyecto») o `undefined` (nadie eligió). */
export function contextoElegido(exploracionId: string): string | null | undefined {
  return elegidos.get(exploracionId);
}

export function elegirElContexto(exploracionId: string, proyectoId: string | null): void {
  elegidos.set(exploracionId, proyectoId);
  for (const oyente of oyentes) oyente();
}

/** El proyecto con que se ubica: el elegido o, sin elegir, el sugerido (el primero de la lista: el activo más nuevo). */
export function contextoParaUbicar(elegido: string | null | undefined, proyectos: readonly { id: string }[]): string | null {
  return elegido === undefined ? (proyectos[0]?.id ?? null) : elegido;
}
