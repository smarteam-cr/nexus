/**
 * lib/cobranza/conectores-en-mora.ts — los conectores que pasaron el plazo de mora: Nexus los marca y PROPONE
 * desactivarlos; una persona confirma (2026-11-13). PURO y CLIENT-SAFE.
 *
 * ── POR QUÉ NUNCA ES AUTOMÁTICO ─────────────────────────────────────────────────
 * Cortarle un conector a un cliente detiene su operación (la sincronización con SAP, con QuickBooks). Si la mora sale de
 * un error de conciliación —un pago que entró y nadie registró—, el corte es carísimo y es nuestro. Por eso Nexus solo
 * propone, y la desactivación queda con quién la confirmó y cuándo (`desactivacionConfirmadaPor/En`).
 *
 * ── EL PLAZO ────────────────────────────────────────────────────────────────────
 * Más de 30 días vencido, contados como en todo Cobranza: desde que vence la factura (emisión + crédito). Es el mismo
 * umbral con que la cartera de Customer Success llama «grave» a una deuda (`DIAS_DE_DEUDA_GRAVE`). Una promesa de pago
 * vigente frena la propuesta hasta su fecha: el cliente ya dijo cuándo paga.
 *
 * ── DESPUÉS DE DESACTIVARLO ─────────────────────────────────────────────────────
 * Si el cliente paga y deja de estar en mora, Nexus propone reactivarlo. Reactivar limpia la marca.
 */
import { DEFAULT_CREDITO_DIAS, addDaysISO, diffDays, marcaPromesa } from "./engine";

/** Días después del vencimiento de la factura a partir de los cuales se propone desactivar. */
export const DIAS_DE_MORA_PARA_DESACTIVAR = 30;

export interface CobroDelConector {
  estado: string;
  /** AAAA-MM-DD. */
  fechaEmision: string | null;
  promesaPago: string | null;
}

export interface ConectorParaMora {
  servicioId: string;
  cuentaId: string;
  clienteNombre: string;
  descripcion: string | null;
  tipoServicio: string;
  estado: string;
  creditoDias: number | null;
  desactivacionConfirmadaPor: string | null;
  /** ISO. */
  desactivacionConfirmadaEn: string | null;
  cobros: CobroDelConector[];
}

export type SituacionDelConector =
  | { clave: "proponer-desactivar"; diasDeMora: number; cuotas: number }
  | { clave: "con-promesa"; diasDeMora: number; cuotas: number; promesa: string }
  | { clave: "desactivado"; diasDeMora: number; por: string; en: string }
  | { clave: "proponer-reactivar"; por: string; en: string };

export interface ConectorEnMora extends ConectorParaMora {
  situacion: SituacionDelConector;
}

/** La mora del conector: cuántas facturas vencidas y la más vieja, en días después de vencer. */
export function moraDe(c: Pick<ConectorParaMora, "cobros" | "creditoDias">, hoy: string): { cuotas: number; dias: number; promesa: string | null } {
  const credito = c.creditoDias ?? DEFAULT_CREDITO_DIAS;
  let cuotas = 0;
  let dias = 0;
  let promesa: string | null = null;
  for (const x of c.cobros) {
    if (x.estado === "COBRADO" || !x.fechaEmision) continue;
    const d = diffDays(addDaysISO(x.fechaEmision, credito), hoy);
    if (d <= 0) continue;
    cuotas++;
    dias = Math.max(dias, d);
    if (marcaPromesa({ estado: x.estado, fechaEmisionISO: x.fechaEmision, promesaPagoISO: x.promesaPago }, hoy) === "vigente") {
      if (!promesa || x.promesaPago! > promesa) promesa = x.promesaPago!.slice(0, 10);
    }
  }
  return { cuotas, dias, promesa };
}

export function situacionDelConector(c: ConectorParaMora, hoy: string): SituacionDelConector | null {
  if (c.tipoServicio !== "CONECTOR" || c.estado !== "ACTIVO") return null;
  const m = moraDe(c, hoy);
  const enMora = m.dias > DIAS_DE_MORA_PARA_DESACTIVAR;
  if (c.desactivacionConfirmadaPor && c.desactivacionConfirmadaEn) {
    return enMora
      ? { clave: "desactivado", diasDeMora: m.dias, por: c.desactivacionConfirmadaPor, en: c.desactivacionConfirmadaEn }
      : { clave: "proponer-reactivar", por: c.desactivacionConfirmadaPor, en: c.desactivacionConfirmadaEn };
  }
  if (!enMora) return null;
  if (m.promesa) return { clave: "con-promesa", diasDeMora: m.dias, cuotas: m.cuotas, promesa: m.promesa };
  return { clave: "proponer-desactivar", diasDeMora: m.dias, cuotas: m.cuotas };
}

/** Los conectores que piden algo (o que están desactivados), lo más urgente primero. */
export function conectoresEnMora(conectores: readonly ConectorParaMora[], hoy: string): ConectorEnMora[] {
  const orden: Record<SituacionDelConector["clave"], number> = { "proponer-desactivar": 0, "proponer-reactivar": 1, "con-promesa": 2, desactivado: 3 };
  return conectores
    .map((c) => ({ c, s: situacionDelConector(c, hoy) }))
    .filter((x): x is { c: ConectorParaMora; s: SituacionDelConector } => x.s !== null)
    .map(({ c, s }) => ({ ...c, situacion: s }))
    .sort((a, b) => orden[a.situacion.clave] - orden[b.situacion.clave] || a.clienteNombre.localeCompare(b.clienteNombre, "es"));
}

/** Los que esperan una decisión de una persona: desactivar o reactivar. */
export const esperanDecision = (xs: readonly ConectorEnMora[]) =>
  xs.filter((x) => x.situacion.clave === "proponer-desactivar" || x.situacion.clave === "proponer-reactivar");
