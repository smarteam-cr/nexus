/**
 * lib/tareas/reunion-elegida.ts — la reunión que una persona eligió de su calendario con «Ya la agendé» (2026-10-20,
 * decisión de Elías). CLIENT-SAFE y puro.
 *
 * Queda como una reunión planeada (una tarea de clase «reunion», lib/tareas/mutaciones.ts › planearReunion) con
 * `origenId` «elegida:<cuenta>:<evento>»: elegir otra vez la misma no duplica, y la regla de servicio la cuenta hasta 30
 * días (lib/mi-dia/servicio.ts › reunionEnLosProximosDias), porque Nexus la vio en el calendario.
 */
export const PREFIJO_DE_LA_ELEGIDA = "elegida:";

export function origenDeLaElegida(clientId: string, eventoId: string): string {
  return `${PREFIJO_DE_LA_ELEGIDA}${clientId}:${eventoId}`.slice(0, 400);
}

export function esReunionElegida(origenId: string | null | undefined): boolean {
  return !!origenId && origenId.startsWith(PREFIJO_DE_LA_ELEGIDA);
}
