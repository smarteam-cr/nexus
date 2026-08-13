/**
 * lib/landing/money.ts — la ÚNICA aritmética de dinero del motor de documentos.
 *
 * Vivía adentro de `sections-website.tsx` (parseAmount / totalOf / fmtMoney) sin un solo
 * test, y con tres errores que se ven en pantalla y suman mal un número que el cliente
 * guarda. Sale a `lib/` porque el project `unit` de vitest solo mira `lib/**` y esto es lo
 * último del motor que puede permitirse no tener test: es la parte que produce el número
 * que el prospecto compara contra el contrato.
 *
 * ── POR QUÉ LOS MONTOS SON TEXTO ────────────────────────────────────────────
 * `coerceToSchema` (lib/ai/section-schema.ts) aplana toda hoja que no sea string: un número
 * en el schema del agente se pierde en silencio. Por eso el monto se guarda como se escribe
 * y el total se calcula AL RENDERIZAR. La contrapartida es esta función.
 *
 * ── POR QUÉ NO SE UNIFICA CON LOS OTROS DOS FORMATOS DE MONEDA ──────────────
 * Hay tres en el repo y NO son duplicación, son reglas distintas:
 *  · `fmtMonto` (components/cobranza/format.ts): recibe `number|null` de columnas decimal,
 *    formatea en `es-CR`, y lleva una regla de NEGOCIO de Cobranza —"USD → $, todo lo demás
 *    → ₡"— que es falsa para MXN o EUR. Importarla acá metería la doctrina de Cobranza en un
 *    documento que se le muestra a un cliente.
 *  · `formatTamUsd` (lib/clients/kind.ts): USD fijo, para un formulario interno.
 *  · esta: texto libre → intervalo → texto, multi-moneda por código ISO.
 * Si algún día se unifican, que sea una decisión con las tres reglas a la vista.
 */

/** Un monto resuelto. Un valor fijo es el intervalo degenerado `min === max`. */
export interface Rango {
  min: number;
  max: number;
}

/**
 * `null`  = no hay nada escrito → se ignora, no cuenta y no marca nada (una línea sin
 *           precio no afirma nada).
 * `"sucio"` = hay algo que parece plata pero NO es sumable ("A definir", "13%",
 *           "$1,800 por página", otra moneda) → fuera del total Y contado como pendiente.
 */
export type MontoParse = Rango | "sucio" | null;

/** Símbolo por código ISO. `$` es ambiguo a propósito: lo usan USD, MXN, COP, CLP, DOP… */
const SIMBOLO: Record<string, string> = {
  USD: "$", MXN: "$", COP: "$", CLP: "$", DOP: "RD$", ARS: "$",
  CRC: "₡", EUR: "€", GTQ: "Q", PEN: "S/", GBP: "£", BRL: "R$",
};

/** Símbolos que identifican UNA sola moneda. `$` no está: no puede delatar contradicción. */
const MONEDA_POR_SIMBOLO: Array<[string, string]> = [
  ["₡", "CRC"], ["€", "EUR"], ["£", "GBP"], ["S/", "PEN"], ["R$", "BRL"],
];

const CODIGOS = Object.keys(SIMBOLO);

/** Número o rango, con `+`/`~` opcionales. Todo lo demás es sucio. */
const FORMA = /^[+~]?[\d.,]+(?:\s*[–—-]\s*[\d.,]+)?\+?$/;

/**
 * "1,800" · "1.800" · "₡1.500.000" · "$1,800.50" · "1,5" → 1800 · 1800 · 1500000 · 1800.5 · 1.5
 *
 * La regla: el ÚLTIMO separador es decimal SOLO si lo siguen 1 o 2 dígitos; si no, todos son
 * de miles. Sin esto `parseFloat("1.500.000")` devuelve **1.5** — y CRC está en el selector
 * de monedas desde el día uno.
 */
function aNumero(s: string): number | null {
  const limpio = s.trim();
  if (!/\d/.test(limpio)) return null;
  const ultimo = Math.max(limpio.lastIndexOf(","), limpio.lastIndexOf("."));
  let entero = limpio;
  let decimales = "";
  if (ultimo >= 0) {
    const cola = limpio.slice(ultimo + 1);
    if (/^\d{1,2}$/.test(cola)) {
      entero = limpio.slice(0, ultimo);
      decimales = cola;
    }
  }
  const n = Number(`${entero.replace(/[.,\s]/g, "")}${decimales ? `.${decimales}` : ""}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * El monto de UNA línea. `moneda` es la de la sección: si el texto trae un símbolo o un
 * código que la contradice, el monto es sucio y NO entra al total — es la regla dura de
 * Cobranza (CRC y USD nunca se suman ni se convierten) aplicada dentro del motor.
 */
export function parseMonto(monto: string | null | undefined, moneda?: string | null): MontoParse {
  const raw = (monto ?? "").trim();
  if (!raw) return null;

  const codigoSeccion = (moneda ?? "").trim().toUpperCase();
  if (codigoSeccion) {
    for (const [simbolo, codigo] of MONEDA_POR_SIMBOLO) {
      if (raw.includes(simbolo) && codigo !== codigoSeccion) return "sucio";
    }
    const otro = CODIGOS.find((c) => c !== codigoSeccion && new RegExp(`\\b${c}\\b`, "i").test(raw));
    if (otro) return "sucio";
  }

  // Fuera el símbolo, el código y los espacios; lo que queda tiene que ser SOLO el número.
  const desnudo = raw
    .replace(new RegExp(`\\b(?:${CODIGOS.join("|")})\\b`, "gi"), "")
    .replace(/[$₡€£Q]|S\/|R\$|RD\$/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!desnudo) return null; // era solo el símbolo, sin cifra
  if (!FORMA.test(desnudo)) return "sucio";

  const partes = desnudo.replace(/^[+~]/, "").replace(/\+$/, "").split(/[–—-]/);
  const nums = partes.map(aNumero).filter((n): n is number => n != null);
  if (!nums.length) return "sucio"; // tenía forma de número pero no dio ninguno (ej. "0")
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

export interface SumaLineas {
  /** null = ninguna línea aportó un monto sumable → no se pinta total. */
  total: Rango | null;
  /** Cuántas líneas tienen algo escrito que NO se pudo sumar. */
  pendientes: number;
}

/**
 * Suma de intervalos: `min = Σmin`, `max = Σmax`. Un fijo y un rango se suman naturalmente
 * porque un fijo es un intervalo degenerado.
 *
 * ⚠ Las líneas sucias se EXCLUYEN de la suma y se cuentan aparte. Antes se salteaban en
 * silencio, y un total de $12,000 conviviendo con una línea "A definir" es una mentira
 * barata: quien la lee cree que está viendo el precio completo.
 */
export function sumaLineas(
  lineas: Array<{ monto?: string | null }> | null | undefined,
  moneda?: string | null,
): SumaLineas {
  let min = 0;
  let max = 0;
  let alguno = false;
  let pendientes = 0;
  for (const l of lineas ?? []) {
    const r = parseMonto(l?.monto, moneda);
    if (r === null) continue;
    if (r === "sucio") {
      pendientes++;
      continue;
    }
    alguno = true;
    min += r.min;
    max += r.max;
  }
  return { total: alguno ? { min, max } : null, pendientes };
}

/** Suma dos subtotales. `null` si alguno no existe — no se inventa un total parcial. */
export function sumaRangos(a: Rango | null, b: Rango | null): Rango | null {
  if (!a || !b) return null;
  return { min: a.min + b.min, max: a.max + b.max };
}

/**
 * ⚠ Agrupación en `en-US` (1,800) y no en `es-CR` (1.800) A PROPÓSITO, aunque el documento
 * esté en español: el parser trata la coma como separador de miles y Ventas escribe "$5,600".
 * Formatear el total con puntos contradiría el renglón de arriba en la misma tabla. La
 * coherencia parse↔format gana sobre la pureza de locale.
 *
 * Código desconocido → "XAF 1,000". Nunca un `$` sobre una moneda que no lo usa: eso es lo
 * que hacía la versión vieja (hardcodeaba `$` e ignoraba `data.moneda`), así que una
 * propuesta en CRC decía "Montos en CRC" arriba y "$45,000" en el total.
 *
 * Moneda vacía → `$`, que es el comportamiento histórico. Cambiarlo movería el render de
 * los documentos viejos que nunca eligieron moneda.
 */
export function formatMonto(n: number, moneda?: string | null): string {
  const codigo = (moneda ?? "").trim().toUpperCase();
  const cifra = n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (!codigo) return `$${cifra}`;
  const simbolo = SIMBOLO[codigo];
  return simbolo ? `${simbolo}${cifra}` : `${codigo} ${cifra}`;
}

/** Un rango como texto. El extremo alto va sin símbolo, como se hacía ("$5,600–6,650"). */
export function formatRango(r: Rango, moneda?: string | null): string {
  if (r.min === r.max) return formatMonto(r.min, moneda);
  return `${formatMonto(r.min, moneda)}–${r.max.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
