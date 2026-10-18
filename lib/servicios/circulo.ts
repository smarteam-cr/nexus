/**
 * lib/servicios/circulo.ts — dónde va cada etapa de un ciclo dibujado como CÍRCULO. PURO y CLIENT-SAFE.
 *
 * Lo usan las dos superficies que pintan el ciclo de SmartLoop como ciclo y no como una barra: la tarjeta de la etapa del
 * Resumen (components/servicios/CicloEnCirculo.tsx) y la sección «Cómo trabajamos» de la propuesta recurrente
 * (components/landing/sections-recurrente.tsx). Una sola geometría para que las dos digan lo mismo: la primera etapa
 * arriba y el resto en el sentido del reloj, y la flecha de la última vuelve a la primera.
 */

export interface PuntoDelCirculo {
  x: number;
  y: number;
  /** Ángulo en grados, 0 arriba y creciendo en el sentido del reloj. */
  angulo: number;
}

/** `n` puntos repartidos en un círculo de radio `r` con centro (`cx`, `cy`), el primero arriba. */
export function puntosDelCirculo(n: number, r: number, cx: number, cy: number): PuntoDelCirculo[] {
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => {
    const angulo = (360 / n) * i;
    const rad = ((angulo - 90) * Math.PI) / 180;
    return { x: Math.round((cx + r * Math.cos(rad)) * 100) / 100, y: Math.round((cy + r * Math.sin(rad)) * 100) / 100, angulo };
  });
}

/**
 * El arco de una etapa a la siguiente (la última vuelve a la primera), recortado para no tapar los nodos: un `path` SVG.
 * `margen` son los grados que se dejan libres a cada lado del nodo.
 */
export function arcoEntre(i: number, n: number, r: number, cx: number, cy: number, margen = 14): string {
  const paso = 360 / n;
  const desde = paso * i + margen;
  const hasta = paso * (i + 1) - margen;
  const punto = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${Math.round((cx + r * Math.cos(rad)) * 100) / 100} ${Math.round((cy + r * Math.sin(rad)) * 100) / 100}`;
  };
  return `M ${punto(desde)} A ${r} ${r} 0 0 1 ${punto(hasta)}`;
}

/** Cómo está cada etapa respecto de la actual: hecha (ya pasó en este ciclo), actual o por venir. null = sin ciclo. */
export function estadoDeLaEtapa(i: number, actual: number | null): "hecha" | "actual" | "por-venir" {
  if (actual === null) return "por-venir";
  return i < actual ? "hecha" : i === actual ? "actual" : "por-venir";
}
