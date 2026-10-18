/**
 * lib/landing/inversion-costo.ts — lo que Smarteam le paga al proveedor por una licencia, y el margen (2026-10-18).
 *
 * Decisión de Elías (2026-10-17): en cada línea de licencia Ventas anota el PRECIO DE LISTA que se le paga al
 * proveedor (HubSpot, Insider…). Ese costo es público —es la lista del proveedor—, así que si al cliente se le
 * cobra más, Smarteam gana la diferencia; y ese detalle tiene que llegar a Finanzas (lib/finanzas/lo-vendido.ts).
 *
 * ── LO INTERNO NUNCA CRUZA AL CLIENTE ───────────────────────────────────────
 * Las cuatro claves de `CLAVES_INTERNAS_DE_LINEA` viven en el mismo `CanvasBlock.data` que el resto de la línea (sin
 * SQL), y por eso cualquier camino que copie ese Json a una superficie del cliente tiene que pasarlo por
 * `sinLoInterno`: el snapshot que congela «Subir al cliente», el PDF y la propuesta publicada. Lo vigila
 * lib/landing/inversion-costo.test.ts, que falla si uno de esos caminos deja de llamarla. Los agentes no las
 * ven por construcción: la sección de inversión es `agentGenerated:false` y su schema no declara propiedades, así que
 * ni el contrato del assist ni el render del chat las leen.
 *
 * ── POR QUÉ `quienFactura` ───────────────────────────────────────────────────
 * Una licencia que aparece en la propuesta no siempre la factura Smarteam: en Cemaco el cliente le paga directo a
 * HubSpot (y Smarteam cobra la comisión de aliado). Solo cuando Smarteam la revende entra la licencia en los cobros y
 * el costo es un gasto de Smarteam. Ausente = nadie lo dijo, y Finanzas no lo adivina.
 *
 * PURO: sin Prisma, sin red. Client-safe: lo usa el editor de la Inversión.
 */
import { formatRango, parseMonto, type Rango } from "./money";
import { esRecurrente, montoDeLinea, type Contrato, type LineaInversion } from "./inversion";

/** Las claves internas de una línea. ⚠ Sumar una acá es lo que hace que `sinLoInterno` la saque. */
export const CLAVES_INTERNAS_DE_LINEA = ["costoLista", "costoMoneda", "costoCada", "quienFactura"] as const;
export type ClaveInternaDeLinea = (typeof CLAVES_INTERNAS_DE_LINEA)[number];

/** Los grupos de líneas de la sección donde puede haber claves internas. */
const GRUPOS_CON_LINEAS = ["lineas", "licencias", "extras", "recurrentes"] as const;

/** Lo interno de una línea, todo string (`coerceToSchema` aplana lo demás; además así lo escribe `Editable`). */
export interface CostoInternoDeLinea {
  /** El precio de lista que se le paga al proveedor por TODA la línea, en `costoCada` ("$800"). */
  costoLista?: string;
  /** Código ISO del costo. Vacío = la moneda de la sección. */
  costoMoneda?: string;
  /** "mensual" · "anual" · "unica". Vacío = lo que dice la recurrencia de la línea. */
  costoCada?: string;
  /** "smarteam" = Smarteam la revende y la cobra · "proveedor" = el cliente le paga directo · vacío = sin decir. */
  quienFactura?: string;
}

export type LineaConCosto = LineaInversion & CostoInternoDeLinea;

export type CadaCosto = "mensual" | "anual" | "unica";
export type QuienFactura = "smarteam" | "proveedor" | null;

export function quienFacturaDe(l: CostoInternoDeLinea | null | undefined): QuienFactura {
  const v = (l?.quienFactura ?? "").trim().toLowerCase();
  return v === "smarteam" || v === "proveedor" ? v : null;
}

/** Cada cuánto se paga el costo. Lo escrito manda; si no, sigue a la línea (mensual o cobro único). */
export function cadaCostoDe(l: LineaConCosto | null | undefined): CadaCosto {
  const v = (l?.costoCada ?? "").trim().toLowerCase();
  if (v === "mensual" || v === "anual" || v === "unica") return v;
  return esRecurrente(l) ? "mensual" : "unica";
}

export interface CostoDeLinea {
  monto: number;
  /** "" = la sección no declara moneda y el costo tampoco: no se sabe cuál es. */
  moneda: string;
  cada: CadaCosto;
}

/**
 * El costo de UNA línea. null = no hay nada escrito. "sucio" = hay algo que no se pudo leer como UN monto (un rango, un
 * texto, otra moneda que la declarada): no se usa, igual que un monto sucio no suma.
 */
export function costoDeLinea(l: LineaConCosto | null | undefined, monedaSeccion: string): CostoDeLinea | "sucio" | null {
  if (!l || !(l.costoLista ?? "").trim()) return null;
  const moneda = ((l.costoMoneda ?? "").trim() || monedaSeccion).toUpperCase();
  const r = parseMonto(l.costoLista, moneda);
  if (r === null) return null;
  if (r === "sucio" || r.min !== r.max) return "sucio";
  return { monto: r.min, moneda, cada: cadaCostoDe(l) };
}

/** El período en que se compara lo cobrado con lo que se paga. */
export type PeriodoDeMargen = "mes" | "año" | "unico";

export type MargenDeLinea =
  | { estado: "sin-costo" }
  | { estado: "costo-ilegible" }
  | { estado: "sin-precio" }
  | { estado: "monedas-distintas"; monedaCobro: string; monedaCosto: string }
  | { estado: "periodicidad-distinta"; lineaRecurrente: boolean; cada: CadaCosto }
  | {
      estado: "ok";
      periodo: PeriodoDeMargen;
      /** Lo que se le cobra al cliente en el período (después del descuento). */
      cobrado: Rango;
      /** Lo que se le paga al proveedor en el mismo período. */
      costo: number;
      /** cobrado − costo. Negativo = se le cobra al cliente menos que la lista. */
      margen: Rango;
      /** El margen sobre lo cobrado, con un decimal. null si lo cobrado es 0. */
      pct: number | null;
      moneda: string;
    };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * El margen de UNA línea: lo que se le cobra al cliente contra lo que se le paga al proveedor, en el mismo período.
 *
 * El período lo pone lo cobrado: una línea recurrente se compara por mes (o por año con contrato anual) y una de cobro
 * único contra un costo único. El costo se lleva a ese período multiplicando o dividiendo por 12 —eso NO es convertir
 * moneda—; si las monedas son distintas no se compara (los motores nunca convierten). Una línea recurrente con un costo
 * único (o al revés) tampoco: no hay un período en común que no sea inventado.
 */
export function margenDeLinea(l: LineaConCosto | null | undefined, monedaSeccion: string, contrato: Contrato = "mensual"): MargenDeLinea {
  const costo = costoDeLinea(l, monedaSeccion);
  if (costo === null) return { estado: "sin-costo" };
  if (costo === "sucio") return { estado: "costo-ilegible" };
  const m = montoDeLinea(l, monedaSeccion, contrato);
  if (!m.rango || m.sucio) return { estado: "sin-precio" };
  const monedaCobro = monedaSeccion.toUpperCase();
  if (costo.moneda !== monedaCobro) return { estado: "monedas-distintas", monedaCobro, monedaCosto: costo.moneda };

  const recurrente = esRecurrente(l);
  let costoEnPeriodo: number;
  let periodo: PeriodoDeMargen;
  if (!recurrente) {
    if (costo.cada !== "unica") return { estado: "periodicidad-distinta", lineaRecurrente: false, cada: costo.cada };
    costoEnPeriodo = costo.monto;
    periodo = "unico";
  } else {
    if (costo.cada === "unica") return { estado: "periodicidad-distinta", lineaRecurrente: true, cada: costo.cada };
    periodo = contrato === "anual" ? "año" : "mes";
    if (periodo === "mes") costoEnPeriodo = costo.cada === "mensual" ? costo.monto : costo.monto / 12;
    else costoEnPeriodo = costo.cada === "anual" ? costo.monto : costo.monto * 12;
  }
  costoEnPeriodo = r2(costoEnPeriodo);
  const margen = { min: r2(m.rango.min - costoEnPeriodo), max: r2(m.rango.max - costoEnPeriodo) };
  const pct = m.rango.min > 0 ? Math.round((margen.min / m.rango.min) * 1000) / 10 : null;
  return { estado: "ok", periodo, cobrado: m.rango, costo: costoEnPeriodo, margen, pct, moneda: monedaCobro };
}

/** El margen en una línea de texto para el editor (nunca para el cliente). */
export function textoDeMargen(m: MargenDeLinea, moneda: string): string {
  switch (m.estado) {
    case "sin-costo":
      return "Sin el precio de lista del proveedor.";
    case "costo-ilegible":
      return "El precio de lista no se pudo leer: escribe un solo monto.";
    case "sin-precio":
      return "Falta lo que se le cobra al cliente para calcular el margen.";
    case "monedas-distintas":
      return `El costo está en ${m.monedaCosto || "otra moneda"} y se cobra en ${m.monedaCobro || "otra moneda"}: no se compara.`;
    case "periodicidad-distinta":
      return m.lineaRecurrente
        ? "La línea se cobra todos los meses y el costo es de una vez: no se compara."
        : "La línea es de cobro único y el costo se paga cada período: no se compara.";
    case "ok": {
      const sufijo = m.periodo === "mes" ? " al mes" : m.periodo === "año" ? " al año" : "";
      const signo = m.margen.min < 0 ? "Pierdes" : "Margen";
      const valor = m.margen.min < 0
        ? formatRango({ min: -m.margen.max, max: -m.margen.min }, moneda)
        : formatRango(m.margen, moneda);
      const pct = m.pct === null ? "" : ` (${m.pct.toLocaleString("es-CR")} %)`;
      return `${signo}: ${valor}${sufijo}${pct} · costo ${formatRango({ min: m.costo, max: m.costo }, moneda)}${sufijo}`;
    }
  }
}

/* ── La frontera: lo interno fuera de todo lo que ve el cliente ─────────────────────── */

function lineaSinLoInterno(item: unknown): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const o = item as Record<string, unknown>;
  if (!CLAVES_INTERNAS_DE_LINEA.some((k) => k in o)) return item;
  const limpio: Record<string, unknown> = { ...o };
  for (const k of CLAVES_INTERNAS_DE_LINEA) delete limpio[k];
  return limpio;
}

/**
 * El `data` de un bloque SIN lo interno de sus líneas. Mira los grupos de línea de cualquier sección (no solo la de
 * inversión: una sección copiada o un módulo nuevo que reuse la forma queda cubierto igual). Si no había nada que
 * sacar devuelve el MISMO objeto. Tolera basura: un Json crudo de la base puede traer cualquier cosa.
 */
export function sinLoInterno<T>(data: T): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  let cambio = false;
  const out: Record<string, unknown> = { ...d };
  for (const g of GRUPOS_CON_LINEAS) {
    const ls = d[g];
    if (!Array.isArray(ls)) continue;
    const limpias = ls.map(lineaSinLoInterno);
    if (limpias.some((x, i) => x !== ls[i])) {
      out[g] = limpias;
      cambio = true;
    }
  }
  return (cambio ? out : data) as T;
}

/** Las secciones (con sus bloques) sin lo interno: la forma que congela el snapshot y la que recibe el PDF. */
export function seccionesSinLoInterno<B extends { data: unknown }, S extends { blocks: B[] }>(secciones: S[]): S[] {
  return secciones.map((s) => ({ ...s, blocks: s.blocks.map((b) => ({ ...b, data: sinLoInterno(b.data) })) }));
}

/** ¿Queda alguna clave interna en este Json? Lo usa la prueba de la frontera y sirve de chequeo en caliente. */
export function tieneLoInterno(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  if (Array.isArray(data)) return data.some(tieneLoInterno);
  const o = data as Record<string, unknown>;
  if (CLAVES_INTERNAS_DE_LINEA.some((k) => k in o)) return true;
  return Object.values(o).some(tieneLoInterno);
}
