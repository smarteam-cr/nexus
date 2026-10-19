/**
 * lib/finanzas/licencias-formulario.ts — el formulario de un contrato con licencias revendidas, de ida y vuelta
 * (2026-10-19). Client-safe: lo usa el editor de components/finanzas/equilibrio/LicenciasRevendidas.tsx.
 *
 * El costo de la licencia son tres datos (cuánto, en qué moneda, cada cuántos meses) y la regla de
 * `problemasDeLicencia` los pide juntos. Hasta el 2026-10-19 el formulario los pedía uno por uno: quien escribía solo
 * «70.000» en «Lo que se le paga» veía el botón Guardar apagado y no sabía por qué (prueba 33 del roadmap, Elías). Ahora
 * la moneda y la frecuencia se ven siempre elegidas: la del contrato y cada mes, que es como se lee el costo en la
 * pantalla («HubSpot: US$70.000 al mes»). Se mandan solo si hay un monto: sin monto, el contrato queda sin costo.
 */
import { parseMontoLocal } from "@/lib/cobranza/montos";
import type { DatosDeLicencia, LicenciaDeContrato } from "./licencias";

export type MonedaDeContrato = "USD" | "CRC";

export interface FormularioDeLicencia {
  cuentaId: string;
  moneda: MonedaDeContrato;
  montoContrato: string;
  montoServicio: string;
  proveedor: string;
  costoMonto: string;
  /** "" = la misma moneda del contrato. */
  costoMoneda: "" | MonedaDeContrato;
  /** Meses entre pago y pago, como texto ("1" = cada mes). */
  costoCadaMeses: string;
  desde: string;
  hasta: string;
  fuente: string;
  notas: string;
}

/** Cada cuánto se le paga al proveedor, en palabras. Un valor guardado que no está acá se agrega al elegirlo. */
export const FRECUENCIAS_DEL_COSTO: ReadonlyArray<{ meses: number; etiqueta: string }> = [
  { meses: 1, etiqueta: "Cada mes" },
  { meses: 3, etiqueta: "Cada 3 meses" },
  { meses: 6, etiqueta: "Cada 6 meses" },
  { meses: 12, etiqueta: "Cada año" },
];

export const FORMULARIO_VACIO: FormularioDeLicencia = {
  cuentaId: "",
  moneda: "USD",
  montoContrato: "",
  montoServicio: "",
  proveedor: "HubSpot",
  costoMonto: "",
  costoMoneda: "",
  costoCadaMeses: "1",
  desde: "",
  hasta: "",
  fuente: "",
  notas: "",
};

/**
 * «70.000», «161.700,50» o «161700.50», con la regla del importador (`parseMontoLocal`): un separador solo seguido de
 * exactamente 3 dígitos es de miles; con 1-2, decimal; con los dos, el último es el decimal. Vacío = null. Un texto
 * que no es un número da NaN, para que `problemasDeLicencia` lo marque y no se guarde un 0 en silencio.
 */
export function numeroDelCampo(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  return parseMontoLocal(t) ?? Number.NaN;
}

/** La moneda en que se guarda el costo: la elegida o, si no, la del contrato. */
export const monedaDelCosto = (f: Pick<FormularioDeLicencia, "costoMoneda" | "moneda">): MonedaDeContrato => f.costoMoneda || f.moneda;

/** Lo que se guarda. Sin monto de costo, el contrato va sin costo: la moneda y la frecuencia no se mandan solas. */
export function datosDelFormulario(f: FormularioDeLicencia): DatosDeLicencia {
  const costo = numeroDelCampo(f.costoMonto);
  return {
    cuentaId: f.cuentaId,
    moneda: f.moneda,
    montoContrato: numeroDelCampo(f.montoContrato) ?? 0,
    montoServicio: numeroDelCampo(f.montoServicio) ?? 0,
    proveedor: f.proveedor,
    costoMonto: costo,
    costoMoneda: costo === null ? null : monedaDelCosto(f),
    costoCadaMeses: costo === null ? null : (numeroDelCampo(f.costoCadaMeses) ?? 1),
    desde: f.desde || null,
    hasta: f.hasta || null,
    fuente: f.fuente,
    notas: f.notas || null,
  };
}

/** El formulario de un contrato guardado. Sin costo, la moneda y la frecuencia quedan en lo de siempre. */
export function formularioDeContrato(l: LicenciaDeContrato): FormularioDeLicencia {
  const moneda: MonedaDeContrato = l.moneda === "CRC" ? "CRC" : "USD";
  return {
    cuentaId: l.cuentaId,
    moneda,
    montoContrato: String(l.montoContrato),
    montoServicio: String(l.montoServicio),
    proveedor: l.proveedor,
    costoMonto: l.costoMonto === null ? "" : String(l.costoMonto),
    costoMoneda: l.costoMoneda === "CRC" || l.costoMoneda === "USD" ? (l.costoMoneda === moneda ? "" : l.costoMoneda) : "",
    costoCadaMeses: l.costoCadaMeses === null ? "1" : String(l.costoCadaMeses),
    desde: l.desde ?? "",
    hasta: l.hasta ?? "",
    fuente: l.fuente,
    notas: l.notas ?? "",
  };
}
