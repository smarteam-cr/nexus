/**
 * lib/business-cases/descuento.ts — cuánto descuento trae una propuesta y si Marco lo aprobó (2026-10-18). PURO y
 * client-safe: lo usan el editor de la Inversión, la ruta que guarda la aprobación y la simulación de comisiones.
 *
 * Iniciativa D del roadmap («Comisiones que cuiden el valor de la cuenta», docs/comisiones-descuento-plan.md): bajar una
 * recurrencia de US$ 3.000 a US$ 2.800 al mes regala US$ 2.400 al año. Un descuento de más del `UMBRAL_DE_APROBACION`
 * lo aprueba dirección en la propuesta, y queda quién, cuándo y hasta qué porcentaje.
 *
 * ── QUÉ SE MIDE ─────────────────────────────────────────────────────────────
 * Solo los SERVICIOS de Smarteam (`lineas`): las licencias pagan su propia comisión y su descuento lo da HubSpot. El
 * descuento de cada línea sale del motor de la Inversión (`montoDeLinea`: `bruto` es el precio de lista, `rango` lo que
 * se cobra), así que es el mismo número que ve el cliente tachado. Todo se lleva a 12 meses: lo recurrente × 12.
 *
 * ── DÓNDE QUEDA LA APROBACIÓN, SIN SQL ──────────────────────────────────────
 * Entry reservada `__descuento` del Json `ProjectCanvas.sections` del canvas v0 de la propuesta (el mismo contrato que
 * `__meta`: el doble guion bajo dice «no soy una sección»). El v0 no se regenera, así que la aprobación sobrevive a
 * una versión nueva. La escribe SOLO `POST /api/business-cases/[id]/descuento`, que calcula el porcentaje en el
 * servidor. Vale mientras el descuento no suba por encima de lo aprobado.
 */
import { adoptarRecurrentes, adoptarShapeNuevo, esInversionLegacy, esLineaActiva, esRecurrente, gruposDeInversion, montoDeLinea, type InversionData } from "@/lib/landing/inversion";

/** Por encima de este porcentaje de descuento (sobre el precio de lista de 12 meses), lo aprueba dirección. */
export const UMBRAL_DE_APROBACION = 10;

/** Quién aprueba un descuento: dirección (Marco). Un rol, no un correo: si cambia quién dirige, no hay que tocar código. */
export const ROLES_QUE_APRUEBAN_DESCUENTOS = ["SUPER_ADMIN"] as const;

export function puedeAprobarDescuentos(rol: string | null | undefined): boolean {
  return (ROLES_QUE_APRUEBAN_DESCUENTOS as readonly string[]).includes(rol ?? "");
}

/** Los meses que vale una recurrencia. El mismo número que usa la simulación de comisiones. */
export const MESES_DEL_VALOR = 12;

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface DescuentoDeServicios {
  moneda: string;
  /** Lo que se cobra una vez (neto) y lo que se cobra al mes (neto). */
  unico: number;
  mensual: number;
  /** Lo descontado una vez y lo descontado al mes. */
  descontadoUnico: number;
  descontadoMensual: number;
  /** El valor de 12 meses: único + 12 × mensual, ya con el descuento. */
  valor: number;
  /** Lo descontado en 12 meses: único + 12 × mensual. */
  descontado: number;
  /** Lo descontado sobre el precio de lista de 12 meses, en por ciento (6,67 = 6,67 %). 0 sin descuento. */
  porcentaje: number;
  /** Alguna línea activa no se pudo leer (un monto o un descuento con texto): los números se quedan cortos. */
  incompleto: boolean;
  /** Hay al menos una línea de servicio con monto. */
  hayServicios: boolean;
}

/** El descuento de los servicios de una sección de Inversión (el `data` crudo del bloque). */
export function descuentoDeServicios(data: unknown): DescuentoDeServicios {
  const crudo = (data && typeof data === "object" ? data : {}) as InversionData;
  const d = adoptarRecurrentes(esInversionLegacy(crudo) ? adoptarShapeNuevo(crudo) : crudo);
  // El plazo «mensual» a propósito: así una línea recurrente da su valor al mes, que es lo que se multiplica por 12.
  const g = gruposDeInversion({ ...d, contrato: "mensual" });
  let unico = 0;
  let mensual = 0;
  let descontadoUnico = 0;
  let descontadoMensual = 0;
  let incompleto = false;
  let hayServicios = false;
  for (const l of g.servicios.lineas) {
    if (!esLineaActiva(l)) continue;
    const m = montoDeLinea(l, g.moneda, "mensual");
    if (m.sucio) {
      incompleto = true;
      continue;
    }
    if (!m.rango) continue;
    hayServicios = true;
    const neto = m.rango.min;
    const quitado = m.bruto ? Math.max(0, m.bruto.min - neto) : 0;
    if (esRecurrente(l)) {
      mensual += neto;
      descontadoMensual += quitado;
    } else {
      unico += neto;
      descontadoUnico += quitado;
    }
  }
  const valor = unico + MESES_DEL_VALOR * mensual;
  const descontado = descontadoUnico + MESES_DEL_VALOR * descontadoMensual;
  const lista = valor + descontado;
  return {
    moneda: g.moneda,
    unico: r2(unico),
    mensual: r2(mensual),
    descontadoUnico: r2(descontadoUnico),
    descontadoMensual: r2(descontadoMensual),
    valor: r2(valor),
    descontado: r2(descontado),
    porcentaje: lista > 0 ? r2((descontado / lista) * 100) : 0,
    incompleto,
    hayServicios,
  };
}

// ── La aprobación ──────────────────────────────────────────────────────────────

export const CLAVE_DE_LA_APROBACION = "__descuento";

/** Cuántas aprobaciones se guardan (la historia de quién aprobó qué). */
const MAX_APROBACIONES = 10;

export interface AprobacionDeDescuento {
  /** Hasta qué porcentaje aprobó: un descuento igual o menor sigue aprobado. */
  porcentaje: number;
  /** Lo descontado en 12 meses que vio quien aprobó. */
  descontado: number;
  moneda: string;
  porEmail: string;
  porNombre: string;
  /** ISO. */
  en: string;
}

const esAprobacion = (x: unknown): x is AprobacionDeDescuento => {
  const a = x as AprobacionDeDescuento;
  return !!a && typeof a === "object" && typeof a.porcentaje === "number" && typeof a.porEmail === "string" && typeof a.en === "string";
};

/** Las aprobaciones guardadas en el Json de secciones del v0, de la más vieja a la más nueva. Tolerante a basura. */
export function aprobacionesDe(sections: unknown): AprobacionDeDescuento[] {
  if (!Array.isArray(sections)) return [];
  const entry = sections.find((s) => s && typeof s === "object" && (s as { key?: unknown }).key === CLAVE_DE_LA_APROBACION) as
    | { aprobaciones?: unknown }
    | undefined;
  return Array.isArray(entry?.aprobaciones) ? entry.aprobaciones.filter(esAprobacion) : [];
}

/** El Json de secciones con una aprobación más. Toca SOLO la entry `__descuento`; el resto queda como estaba. */
export function conAprobacion(sections: unknown, nueva: AprobacionDeDescuento): unknown[] {
  const lista = Array.isArray(sections) ? sections : [];
  const aprobaciones = [...aprobacionesDe(lista), nueva].slice(-MAX_APROBACIONES);
  const entry = { key: CLAVE_DE_LA_APROBACION, aprobaciones };
  const i = lista.findIndex((s) => s && typeof s === "object" && (s as { key?: unknown }).key === CLAVE_DE_LA_APROBACION);
  return i >= 0 ? lista.map((s, k) => (k === i ? entry : s)) : [...lista, entry];
}

export type EstadoDeLaAprobacion =
  | { estado: "no-hace-falta" }
  | { estado: "aprobado"; aprobacion: AprobacionDeDescuento }
  | { estado: "falta"; anterior: AprobacionDeDescuento | null };

/** ¿Hace falta aprobar este porcentaje, y está aprobado? La aprobación vale mientras el descuento no la pase. */
export function estadoDeLaAprobacion(porcentaje: number, aprobaciones: readonly AprobacionDeDescuento[]): EstadoDeLaAprobacion {
  if (porcentaje <= UMBRAL_DE_APROBACION) return { estado: "no-hace-falta" };
  const ultima = aprobaciones[aprobaciones.length - 1] ?? null;
  // La que cubre: la más nueva que aprobó al menos este porcentaje (con la holgura del redondeo a dos decimales).
  const cubre = [...aprobaciones].reverse().find((a) => a.porcentaje + 0.005 >= porcentaje);
  return cubre ? { estado: "aprobado", aprobacion: cubre } : { estado: "falta", anterior: ultima };
}

/** «14,3 %», armado a mano: `Intl` escribe distinto en Node y en el navegador. */
export function textoPorcentaje(p: number): string {
  const redondeado = Math.round(p * 10) / 10;
  return `${String(redondeado).replace(".", ",")} %`;
}
