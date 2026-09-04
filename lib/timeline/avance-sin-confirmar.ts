/**
 * lib/timeline/avance-sin-confirmar.ts — CUÁNTO LLEVA UN BORRADOR DE AVANCE SIN CONFIRMAR. PURO.
 *
 * D-12 (2026-09-04). El agente de avance deja un BORRADOR (ProjectTimeline.pendingProgress) que el
 * CSE confirma en el banner del cronograma. Hasta hoy el borrador no tenía edad: la acción del
 * panel decía «hay avance que no confirmaste» el día 1 igual que el día 40, y la cartera no lo
 * decía en absoluto. Un borrador de semanas es peor que ninguno: vos y el cliente miran un avance
 * más viejo que el real, y el vigilante de CS razona sobre ese avance viejo.
 *
 * La fecha sale del propio borrador (`generatedAt`, que el agente escribe desde esta fecha) o, para
 * los borradores anteriores, de la corrida que lo produjo (`pendingProgressRunId` → AgentRun). Si
 * no se sabe cuándo se generó, `null`: no se inventa una edad.
 */

/** Días sin confirmar a partir de los cuales el aviso se vuelve ámbar y la cartera lo cuenta. */
export const DIAS_PARA_AVISAR = 7;

export interface BorradorFechable {
  generatedAt?: string | null;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Días ENTEROS desde que se generó el borrador. `null` = no hay borrador, o no se sabe cuándo se
 * generó (ni `generatedAt` ni fecha de corrida). Nunca negativo.
 */
export function diasSinConfirmar(
  borrador: BorradorFechable | null | undefined,
  fechaDeLaCorrida: Date | string | null | undefined,
  ahora: Date,
): number | null {
  if (!borrador) return null;
  const fuente = borrador.generatedAt ?? fechaDeLaCorrida ?? null;
  if (!fuente) return null;
  const t = new Date(fuente).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((ahora.getTime() - t) / MS_POR_DIA));
}

/** ¿Pasó el umbral? Un `null` (sin borrador o sin fecha) nunca está vencido: no se avisa lo que no se sabe. */
export function avanceSinConfirmarVencido(dias: number | null | undefined): boolean {
  return typeof dias === "number" && dias >= DIAS_PARA_AVISAR;
}

/** El rótulo único de la pill de cartera. */
export function rotuloDeAvanceSinConfirmar(dias: number): string {
  return `Avance sin confirmar · ${dias} ${dias === 1 ? "día" : "días"}`;
}
