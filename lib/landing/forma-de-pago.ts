/**
 * lib/landing/forma-de-pago.ts — la FORMA DE PAGO de la propuesta, calculada desde su Inversión.
 * PURO (2026-10-07).
 *
 * Pedido de Elías: «hoy la propuesta muestra el cuadro de inversión, pero no explica cómo se
 * paga, y es algo que los clientes preguntan mucho». Andrés lo resolvía con una sección de HTML a
 * mano (ABG, octubre 2026); esto la vuelve estándar.
 *
 * ⭐ LOS MONTOS NO SE ESCRIBEN DOS VECES. La sección guarda solo la FORMA —cuántas cuotas, cuándo
 * cae cada una, si alguna lleva un porcentaje fijo— y los números salen de la sección «Inversión»
 * del MISMO documento, en tiempo real: si Ventas cambia un precio o borra un descuento, la forma de
 * pago se mueve sola. Copiar el total acá sería la segunda fuente de un mismo número, y la que
 * queda vieja es la que el cliente ve.
 *
 * Qué se reparte: el total de COBRO ÚNICO de los servicios de Smarteam (`lineas`), ya con sus
 * descuentos. Las licencias de un Hub (líneas con `hub`) se le pagan a HubSpot: no entran. Las
 * líneas MENSUALES (el mantenimiento de un conector) no se reparten: van aparte, «desde el mes N».
 * Medido contra ABG: 3.200−200 + 3.500 + 2.500−500 + 4.500−500 = 12.500 en 5 pagos de 2.500, con
 * −1.200 de beneficio y el conector a 300 al mes — lo mismo que Andrés había escrito a mano.
 */
import {
  adoptarRecurrentes,
  conRecurrenciaPorDefecto,
  esInversionLegacy,
  esLineaActiva,
  esRecurrente,
  gruposDeInversion,
  montoDeLinea,
  type InversionData,
} from "./inversion";
import type { Rango } from "./money";

/** El tope de cuotas. «Normalmente 3 o 4, hasta 5» (Elías). */
export const MAX_CUOTAS = 5;
/** Sin nada conversado, la propuesta arranca en 4 pagos. */
export const CUOTAS_POR_DEFECTO = 4;

export const FORMA_DE_PAGO_SECTION_KEY = "forma_de_pago";

export interface PagoDeLaForma {
  /** Cuándo se paga, como lo lee el cliente («Antes de iniciar el proyecto»). */
  momento?: string;
  /** El rótulo corto del calendario («Inicio», «Mes 1»). */
  cuando?: string;
  /** Porcentaje fijo de ESTE pago («50»). Vacío = parte igual del resto. */
  porcentaje?: string;
}

export interface FormaDePagoData {
  /** Cuántos pagos (1 a 5). Texto o número: lo escribe el agente y lo toca la persona. */
  cuotas?: number | string;
  pagos?: PagoDeLaForma[];
  /** Qué cubre el total, en una línea («Implementación de Marketing, Sales y la integración»). */
  resumen?: string;
  /** Desde cuándo corren las mensualidades («mes 5»). Vacío = el mes siguiente al último pago. */
  recurrenteDesde?: string;
  /** Condiciones (impuestos, facturación). */
  nota?: string;
}

export interface PagoCalculado {
  nombre: string;
  momento: string;
  cuando: string;
  /** El porcentaje que le toca, ya resuelto (fijo o parte igual). */
  porcentaje: number;
  /** El monto, o null si la Inversión todavía no da un total. */
  monto: Rango | null;
  /** El porcentaje lo fijó alguien (no es la parte igual). */
  fijo: boolean;
}

export interface PlanDePago {
  moneda: string;
  /** Lo que se reparte. null = la Inversión no tiene montos sumables todavía. */
  total: Rango | null;
  /** Líneas de cobro único con algo escrito que no se pudo sumar: el total sería mentira. */
  pendientes: number;
  descuentos: { concepto: string; monto: Rango }[];
  beneficio: Rango | null;
  pagos: PagoCalculado[];
  /** Todos los pagos son iguales (para decir «Iguales y consecutivos»). */
  iguales: boolean;
  recurrentes: { concepto: string; detalle: string; monto: Rango | null }[];
  /** Desde cuándo corren las mensualidades, ya resuelto («mes 5»). */
  recurrenteDesde: string;
  /** Algo no cierra (los porcentajes fijos pasan del 100 %, o no llegan sin pagos libres). */
  problema: string | null;
}

/** El número de cuotas, acotado a 1–5. Ilegible o vacío = el por defecto. */
export function cuotasDe(data: FormaDePagoData | null | undefined): number {
  const n = Math.round(Number(String(data?.cuotas ?? "").trim()));
  if (!Number.isFinite(n) || n < 1) return CUOTAS_POR_DEFECTO;
  return Math.min(MAX_CUOTAS, n);
}

const ORDINALES_ES = ["Pago inicial", "Segundo pago", "Tercer pago", "Cuarto pago", "Quinto pago"];
const ORDINALES_EN = ["Initial payment", "Second payment", "Third payment", "Fourth payment", "Fifth payment"];

/** El nombre del pago i de n: el primero es el inicial y el último, el final. */
export function nombreDelPago(i: number, n: number, lang: "es" | "en" = "es"): string {
  if (n === 1) return lang === "en" ? "Single payment" : "Pago único";
  if (i === n - 1) return lang === "en" ? "Final payment" : "Pago final";
  return (lang === "en" ? ORDINALES_EN : ORDINALES_ES)[i] ?? `${lang === "en" ? "Payment" : "Pago"} ${i + 1}`;
}

/** Cuándo cae el pago i si nadie lo escribió: el primero al iniciar, después uno por mes. */
export function momentoPorDefecto(i: number, lang: "es" | "en" = "es"): { momento: string; cuando: string } {
  if (i === 0) return lang === "en" ? { momento: "Before the project starts", cuando: "Start" } : { momento: "Antes de iniciar el proyecto", cuando: "Inicio" };
  return lang === "en"
    ? { momento: `${i} month${i === 1 ? "" : "s"} after the start`, cuando: `Month ${i}` }
    : { momento: `${i} ${i === 1 ? "mes" : "meses"} después del inicio`, cuando: `Mes ${i}` };
}

/** «50», «50%», «50,5» → 50.5. Vacío o ilegible → null (parte igual). */
function leerPorcentaje(s: unknown): number | null {
  const t = String(s ?? "").replace("%", "").replace(",", ".").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** «Implementación Marketing Hub Professional» → «Marketing Hub Professional»: el chip es corto. */
function conceptoCorto(s: string): string {
  return s.replace(/^\s*implementaci[oó]n\s+(de\s+)?/i, "").trim() || s.trim();
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Reparte un rango en porcentajes. Cada pago se redondea a centavos y el ÚLTIMO absorbe la
 * diferencia: la suma de los pagos tiene que dar el total exacto, no 12.499,99.
 */
function repartir(total: number, porcentajes: number[]): number[] {
  const out = porcentajes.map((p) => redondear((total * p) / 100));
  const suma = out.slice(0, -1).reduce((a, b) => a + b, 0);
  if (out.length) out[out.length - 1] = redondear(total * (porcentajes.reduce((a, b) => a + b, 0) / 100) - suma);
  return out;
}

export function planDePago(
  forma: FormaDePagoData | null | undefined,
  inversionCruda: InversionData | null | undefined,
  lang: "es" | "en" = "es",
): PlanDePago {
  const n = cuotasDe(forma);
  const escritos = forma?.pagos ?? [];

  // ── Los porcentajes: los fijos se respetan, el resto se reparte parejo ─────────────────
  const fijos = Array.from({ length: n }, (_, i) => leerPorcentaje(escritos[i]?.porcentaje));
  const sumaFija = fijos.reduce<number>((a, p) => a + (p ?? 0), 0);
  const libres = fijos.filter((p) => p === null).length;
  let problema: string | null = null;
  if (sumaFija > 100.0001) problema = lang === "en" ? `The fixed percentages add up to ${redondear(sumaFija)}%.` : `Los porcentajes fijos suman ${redondear(sumaFija)} %.`;
  else if (libres === 0 && Math.abs(sumaFija - 100) > 0.0001)
    problema = lang === "en" ? `The percentages add up to ${redondear(sumaFija)}%, not 100%.` : `Los porcentajes suman ${redondear(sumaFija)} %, no 100 %.`;
  const parteIgual = libres > 0 ? Math.max(0, 100 - sumaFija) / libres : 0;
  const porcentajes = fijos.map((p) => p ?? parteIgual);

  // ── Lo que se reparte, desde la Inversión ─────────────────────────────────────────────
  // El shape viejo de HubSpot son montos de texto libre: no hay nada que repartir ahí.
  const inversion = inversionCruda && !esInversionLegacy(inversionCruda) ? adoptarRecurrentes(inversionCruda) : null;
  const g = inversion ? gruposDeInversion(inversion) : null;
  const moneda = g?.moneda ?? "";
  const contrato = g?.contrato ?? "mensual";

  let min = 0;
  let max = 0;
  let alguno = false;
  let pendientes = 0;
  const descuentos: PlanDePago["descuentos"] = [];
  const recurrentes: PlanDePago["recurrentes"] = [];

  for (const l of g?.servicios.lineas ?? []) {
    if (!esLineaActiva(l)) continue;
    const m = montoDeLinea(l, moneda, contrato);
    if (esRecurrente(l)) {
      if ((l.concepto ?? "").trim() || m.rango) {
        recurrentes.push({ concepto: (l.concepto ?? "").trim(), detalle: (l.detalle ?? "").trim(), monto: m.rango });
      }
      continue;
    }
    if (m.sucio) {
      pendientes++;
      continue;
    }
    if (!m.rango) continue;
    alguno = true;
    min += m.rango.min;
    max += m.rango.max;
    if (m.bruto) {
      descuentos.push({
        concepto: conceptoCorto(l.concepto ?? ""),
        monto: { min: m.bruto.min - m.rango.min, max: m.bruto.max - m.rango.max },
      });
    }
  }
  // Una mensualidad de un tercero SIN Hub (un conector, un servicio aparte) también va al cuadro de
  // «después»; la licencia de un Hub no: se le paga a HubSpot y no es parte de este plan.
  for (const l of conRecurrenciaPorDefecto("licencias", inversion?.licencias)) {
    if (!esLineaActiva(l) || !esRecurrente(l) || (l.hub ?? "").trim()) continue;
    const m = montoDeLinea(l, moneda, contrato);
    if ((l.concepto ?? "").trim() || m.rango) {
      recurrentes.push({ concepto: (l.concepto ?? "").trim(), detalle: (l.detalle ?? "").trim(), monto: m.rango });
    }
  }

  // Con algo pendiente, un total parcial sería un número que nadie cotizó: no se reparte.
  const total: Rango | null = alguno && pendientes === 0 ? { min: redondear(min), max: redondear(max) } : null;
  const pagosMin = total ? repartir(total.min, porcentajes) : null;
  const pagosMax = total ? repartir(total.max, porcentajes) : null;

  const pagos: PagoCalculado[] = porcentajes.map((p, i) => {
    const def = momentoPorDefecto(i, lang);
    return {
      nombre: nombreDelPago(i, n, lang),
      momento: (escritos[i]?.momento ?? "").trim() || def.momento,
      cuando: (escritos[i]?.cuando ?? "").trim() || def.cuando,
      porcentaje: redondear(p),
      monto: pagosMin && pagosMax ? { min: pagosMin[i], max: pagosMax[i] } : null,
      fijo: fijos[i] !== null,
    };
  });

  const beneficioMin = descuentos.reduce((a, d) => a + d.monto.min, 0);
  const beneficioMax = descuentos.reduce((a, d) => a + d.monto.max, 0);

  return {
    moneda,
    total,
    pendientes,
    descuentos,
    beneficio: descuentos.length ? { min: redondear(beneficioMin), max: redondear(beneficioMax) } : null,
    pagos,
    iguales: !problema && pagos.every((p) => Math.abs(p.porcentaje - pagos[0].porcentaje) < 0.0001),
    recurrentes,
    recurrenteDesde: (forma?.recurrenteDesde ?? "").trim() || (lang === "en" ? `month ${n}` : `mes ${n}`),
    problema,
  };
}

/**
 * Lo que la sección de forma de pago necesita de OTRA sección del mismo documento: la Inversión.
 * El motor no propaga data entre secciones, así que las tres superficies que pintan la propuesta
 * —el editor, el link del cliente y el PDF— arman este canal con la MISMA función.
 */
export function inversionDelDocumento(sections: ReadonlyArray<{ key: string; data: unknown }>): InversionData | null {
  return (sections.find((s) => s.key === "inversion")?.data as InversionData | null | undefined) ?? null;
}

/** Revisión para «Antes de subir»: los porcentajes que no cierran. */
export function problemaDeLaFormaDePago(forma: unknown, inversion: unknown): string | null {
  return planDePago(forma as FormaDePagoData | null, inversion as InversionData | null).problema;
}
