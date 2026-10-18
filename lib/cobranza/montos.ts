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

/**
 * Parsea un monto con formato local a number (2 decimales). Acepta "₡1.500.000,00",
 * "$1,200.50", "1200", "1.200,50", "USD 800". null si no hay número reconocible.
 * Regla del separador decimal: si aparecen "." y "," el ÚLTIMO es el decimal; si
 * aparece uno solo, es decimal únicamente cuando le siguen exactamente 1-2 dígitos
 * al final (si no, es separador de miles).
 */
export function parseMontoLocal(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : null;
  const limpio = raw.replace(/[^\d.,-]/g, ""); // fuera símbolos de moneda/espacios/letras
  if (!limpio || !/\d/.test(limpio)) return null;

  const lastDot = limpio.lastIndexOf(".");
  const lastComma = limpio.lastIndexOf(",");
  let normalizado: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // Ambos presentes: el último es el decimal, el otro son miles.
    const decimalSep = lastDot > lastComma ? "." : ",";
    const milesSep = decimalSep === "." ? "," : ".";
    normalizado = limpio.split(milesSep).join("");
    if (decimalSep === ",") normalizado = normalizado.replace(",", ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const idx = lastComma >= 0 ? lastComma : lastDot;
    const tras = limpio.length - idx - 1;
    const unicaAparicion = limpio.indexOf(sep) === idx;
    if (unicaAparicion && tras >= 1 && tras <= 2) {
      normalizado = limpio.replace(sep, "."); // decimal
    } else {
      normalizado = limpio.split(sep).join(""); // miles (repetido o con 3 dígitos)
    }
  } else {
    normalizado = limpio;
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}
