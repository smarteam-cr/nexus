"use client";

/**
 * lib/hooks/useHydrated.ts
 *
 * `false` durante el SSR y en el PRIMER paint del cliente; `true` una vez hidratado.
 *
 * Sirve para todo lo que depende del entorno del usuario y por lo tanto NO puede
 * calcularse en el servidor sin romper la hidratación: la hora actual, la zona
 * horaria, `window`, `matchMedia`… El server y el primer render del cliente pintan
 * la variante neutra (idénticas → sin mismatch) y recién después aparece lo
 * dependiente del cliente.
 *
 * Es el patrón oficial (`useSyncExternalStore` con un `getServerSnapshot` distinto),
 * y a diferencia de `useState(false) + useEffect(() => setState(true))` no dispara la
 * regla `react-hooks/set-state-in-effect`.
 */
import { useSyncExternalStore } from "react";

/** Sin suscripción: el valor nunca cambia después de hidratar. */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
