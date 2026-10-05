/**
 * lib/auditoria-portal/cifras.ts — CÓMO SE ESCRIBE UN NÚMERO, Y CÓMO SE RECONOCE UNO INVENTADO.
 *
 * Una sola forma de escribir cifras en la auditoría (pantalla y análisis): miles con punto SIEMPRE
 * («1.079», no «1079» como haría `es-ES` con cuatro dígitos) y decimales con coma. Y la otra mitad:
 * leer las cifras de un texto para comprobar que cada una sale de los datos. PURO.
 */

/** «13.145» · «1.079» · «46,5». Enteros con punto de miles; un decimal si hace falta. */
export function cifra(n: number, decimales = 0): string {
  const fijo = n.toFixed(decimales);
  const [entero, dec] = fijo.split(".");
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec ? `${conMiles},${dec}` : conMiles;
}

/** «46,5 %» de `parte` sobre `total`; «—» si el total es 0. */
export function porcentaje(parte: number, total: number): string {
  if (total <= 0) return "—";
  const p = (parte / total) * 100;
  if (p > 0 && p < 0.1) return "< 0,1 %";
  return `${cifra(p, 1)} %`;
}

/** Las cifras de un texto como números: «13.145» → 13145, «46,5» → 46.5, «2024-03» → 2024 y 3. */
export function cifrasDe(texto: string): number[] {
  const salida: number[] = [];
  for (const m of texto.matchAll(/\d+(?:\.\d{3})*(?:,\d+)?/g)) {
    const limpio = m[0].replace(/\./g, "").replace(",", ".");
    const n = Number(limpio);
    if (Number.isFinite(n)) salida.push(n);
  }
  return salida;
}

/** Las cifras que un texto puede citar: todas las de los datos que se le dieron al modelo. */
export function cifrasPermitidas(textos: readonly string[]): number[] {
  const set = new Set<number>();
  for (const t of textos) for (const n of cifrasDe(t)) set.add(n);
  return [...set];
}

/**
 * Las cifras de `texto` que NO salen de `permitidas`. Se tolera el redondeo (46 por 46,5; 13.100
 * por 13.145 no: un 1 % como mucho) y los números chicos (≤ 10: «3 workflows», «2 de 7»), que no
 * cambian una conclusión y aparecen en cualquier frase.
 */
export function cifrasSinRespaldo(texto: string, permitidas: readonly number[]): number[] {
  return cifrasDe(texto).filter((v) => {
    if (v <= 10) return false;
    return !permitidas.some((a) => Math.abs(a - v) <= Math.max(0.5, a * 0.01));
  });
}
