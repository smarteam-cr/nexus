/**
 * lib/cobranza/montos.ts
 *
 * Las piezas de plata que usan a la vez el libro de Alex (libro-alex.ts) y «Lo que no cuadra»
 * (odoo/diferencias.ts). Viven acá y no en uno de los dos porque libro-alex.ts ya importa de
 * diferencias.ts: la dirección contraria armaba un ciclo de imports.
 *
 * PURO: sin Intl —el texto de una propuesta no puede cambiar con el locale del servidor—, sin reloj.
 */

/** El IVA de Costa Rica. Nexus guarda los montos SIN él; el Excel de Alex y Odoo hablan con él. */
export const IVA_COSTA_RICA = 1.13;

/** ⚠ Los montos se comparan en centavos, nunca en flotante: Odoo manda 2260.0000000000002. */
export const centavos = (n: number) => Math.round(n * 100);

/** `US$1.867` · `₡796.156,19`. Sin símbolo si no hay moneda. Sin Intl, por lo mismo que el módulo. */
export function fmtMontoLibro(n: number | null, moneda: string | null): string {
  if (n === null) return "—";
  const simbolo = moneda === "CRC" ? "₡" : moneda === "USD" ? "US$" : moneda ? `${moneda} ` : "";
  const [entero = "0", decimales = "00"] = Math.abs(n).toFixed(2).split(".");
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "−" : ""}${simbolo}${miles}${decimales === "00" ? "" : `,${decimales}`}`;
}

/**
 * La única combinación de elementos (entre `min` y `max`) cuyos montos suman exactamente `objetivo`
 * centavos. `"varios"` si hay más de una: elegir entre dos combinaciones iguales es adivinar.
 */
export function subconjuntoUnico<T>(
  items: readonly T[],
  montoEnCentavos: (t: T) => number,
  objetivo: number,
  min: number,
  max: number,
): T[] | "varios" | null {
  const universo = items.slice(0, 16);
  const busqueda: { hallado: T[] | null; varios: boolean } = { hallado: null, varios: false };
  const actual: T[] = [];
  const buscar = (desde: number, suma: number): void => {
    if (busqueda.varios) return;
    if (actual.length >= min && suma === objetivo) {
      if (busqueda.hallado) busqueda.varios = true;
      else busqueda.hallado = [...actual];
      return;
    }
    if (actual.length === max) return;
    for (let i = desde; i < universo.length; i++) {
      const item = universo[i];
      if (item === undefined) continue;
      const c = montoEnCentavos(item);
      if (c <= 0 || suma + c > objetivo) continue;
      actual.push(item);
      buscar(i + 1, suma + c);
      actual.pop();
      if (busqueda.varios) return;
    }
  };
  if (objetivo > 0) buscar(0, 0);
  return busqueda.varios ? "varios" : busqueda.hallado;
}
