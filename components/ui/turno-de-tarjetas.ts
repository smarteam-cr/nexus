"use client";

/**
 * components/ui/turno-de-tarjetas.ts — UNA tarjeta a la vez abajo a la derecha (2026-10-14).
 *
 * Varias preguntas salen en el mismo rincón y por su cuenta: «¿cuánto te tomó?» (lib/tiempos), «¿cuándo lo
 * presentas?» (lib/presentaciones) y la pregunta sobre la cuenta (lib/encuestas-de-cuenta). Apiladas se tapaban y
 * ninguna se contestaba. Cada una pide su turno con una prioridad; se ve la de más prioridad, y cuando se va, la
 * siguiente. El pedido de opinión de Feedback y su panel van aparte: las preguntas ya se esconden con
 * `useFeedback()` (abierto · hayPedido).
 */
import { useEffect, useSyncExternalStore } from "react";

/** Más alto = primero. La de tiempo la dispara la persona con lo que acaba de hacer: va antes que todo. */
export const PRIORIDAD_DE_TARJETA = { tiempo: 30, presentacion: 20, cuenta: 10 } as const;

const pedidos = new Map<string, { prioridad: number; orden: number }>();
const oyentes = new Set<() => void>();
let orden = 0;

function avisar(): void {
  for (const o of oyentes) o();
}

function ganadora(): string | null {
  let mejor: string | null = null;
  let m: { prioridad: number; orden: number } | null = null;
  for (const [id, p] of pedidos) {
    if (!m || p.prioridad > m.prioridad || (p.prioridad === m.prioridad && p.orden < m.orden)) {
      mejor = id;
      m = p;
    }
  }
  return mejor;
}

function suscribir(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** ¿Le toca a esta tarjeta? Mientras `quiere`, la tarjeta está en la fila; se ve solo si es la primera. */
export function useTurnoDeTarjeta(id: string, quiere: boolean, prioridad: number): boolean {
  useEffect(() => {
    if (!quiere) return;
    pedidos.set(id, { prioridad, orden: orden++ });
    avisar();
    return () => {
      pedidos.delete(id);
      avisar();
    };
  }, [id, quiere, prioridad]);
  const primera = useSyncExternalStore(suscribir, ganadora, () => null);
  return quiere && primera === id;
}
