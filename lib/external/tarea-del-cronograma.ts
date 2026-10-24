/**
 * lib/external/tarea-del-cronograma.ts — qué tarea del cronograma cruza al cliente. PURO.
 *
 * Lo usan `readClientTimeline` (el filtro del cronograma externo) y la ruta del servicio de SmartLoop
 * (`lib/servicios/ruta-del-servicio-server.ts`). La Entrega aplica la misma marca al leer sus fases. No cruzan:
 *   · SUSPENDED: se descartó del plan (E).
 *   · needsValidation: es una tarea típica que el agente inventó con un handoff flaco y el CSE
 *     todavía no validó. Hasta el 2026-10-24 cruzaba con su título y su semana (solo se escondía la
 *     marca), contra lo que dice el esquema («NUNCA cruza al cliente»). Roadmap D0.
 *
 * Se filtra en JS y no en un WHERE con el literal del enum, para no depender de que el valor exista
 * en la base (ver el comentario en timeline-view).
 */
export function cruzaAlCliente(t: { status: string; needsValidation: boolean }): boolean {
  return t.status !== "SUSPENDED" && !t.needsValidation;
}
