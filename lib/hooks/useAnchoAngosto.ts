"use client";

/**
 * lib/hooks/useAnchoAngosto.ts
 *
 * `true` cuando la ventana es más angosta que el corte — para los layouts que NO se pueden
 * resolver con una media query porque sus estilos son INLINE, no clases.
 *
 * Caso que lo motivó (2026-08-14): el cronograma que se le comparte al cliente. Es una grilla
 * de «una columna de fase + N columnas de semana» construida con `style={{ gridTemplateColumns }}`
 * en JS. En un teléfono de 375 px eso deja una ventana de ~260 px con scroll horizontal: el
 * cliente abre el enlace y ve nombres de fase y prácticamente ninguna barra. Ninguna cantidad de
 * CSS arregla eso — no hay ancho. Lo que hace falta es renderizar OTRA COSA, y para eso la
 * decisión tiene que estar en JS.
 *
 * ⚠ SSR: durante el render del servidor y el primer paint del cliente devuelve `false` (ancho).
 * Es deliberado y es lo mismo que hace `useHydrated`: server y primer render tienen que pintar
 * lo MISMO o React tira mismatch de hidratación. En un móvil eso significa un parpadeo de la
 * versión ancha antes de la angosta — el precio de no poder saber el viewport en el servidor.
 *
 * ⚠ Y SE SUSCRIBE a los cambios, a diferencia de `useHydrated`: sin eso, rotar el teléfono o
 * arrastrar el borde de la ventana dejaría el layout equivocado hasta recargar.
 */
import { useSyncExternalStore } from "react";

/**
 * El corte. 700 px es donde la grilla del cronograma deja de tener sentido: por debajo, la
 * columna de fase se come más de la mitad de lo visible. No es un breakpoint de dispositivo
 * (un iPad en vertical mide 768 y le sobra ancho para la grilla).
 */
export const ANCHO_ANGOSTO = 700;

function suscribir(cambio: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(`(max-width: ${ANCHO_ANGOSTO}px)`);
  mq.addEventListener("change", cambio);
  return () => mq.removeEventListener("change", cambio);
}

function leer(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(`(max-width: ${ANCHO_ANGOSTO}px)`).matches;
}

/** En el servidor SIEMPRE ancho: es la única respuesta que el server y el cliente comparten. */
const leerEnServidor = () => false;

export function useAnchoAngosto(): boolean {
  return useSyncExternalStore(suscribir, leer, leerEnServidor);
}
