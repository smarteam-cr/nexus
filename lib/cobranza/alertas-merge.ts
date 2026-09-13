/**
 * lib/cobranza/alertas-merge.ts
 *
 * Qué hace un corte con una alerta que ya tiene fila. PURO: acá se decide y `upsertAlertas`
 * (lib/cobranza/mutations.ts) escribe.
 *
 * ── UNA FILA POR COBRO, QUE SUBE ────────────────────────────────────────────────
 * Un cobro recorre cuatro alertas: COBRO_PROXIMO (falta facturar, entra a la quincena),
 * FACTURACION_ATRASADA, COBRO_VENCIDO y PROMESA_INCUMPLIDA. Cada una tiene su `dedupeKey`, y con la
 * regla vieja —buscar la fila viva por clave— un cobro que pasaba de una a otra dejaba la anterior
 * abierta y abría otra más. ALMOTEC es el caso: su «falta facturar» seguía abierta y pospuesta al
 * 31-ago, el mismo día que venció su promesa, y el corte le iba a abrir una segunda fila al lado en
 * vez de subir la que Alex ya tenía en el feed.
 *
 * Ahora las cuatro comparten fila:
 *  - **Sube de situación** → la fila vuelve a ABIERTA, se limpia quién la vio y se anula el
 *    posponer: quien la vio o la pospuso lo hizo sobre otra situación, no sobre esta. Son dos casos:
 *     · a PROMESA_INCUMPLIDA, desde cualquier tipo. Es la decisión 5 de Alex (2026-09-12): si la
 *       fecha pasa sin depósito, la alerta sube.
 *     · de «falta facturar» (COBRO_PROXIMO, FACTURACION_ATRASADA) a COBRO_VENCIDO: lo pospuesto era
 *       trabajo de Smarteam y ahora es deuda del cliente. ⚠ Sin esto el vencido heredaba el posponer.
 *       Es Ecoquintas, medido el 2026-09-12: su «falta facturar» seguía pospuesta al 30-sep por el
 *       auto-posponer de la promesa (ya retirado), la factura vence por crédito el 18-sep, y los
 *       US$1.880 vencidos no se iban a ver en el feed hasta el 30-sep. La alerta no desaparece.
 *  - **Otro cambio de tipo dentro de la familia** (incumplida → vencido porque el cliente prometió
 *    otra fecha, o vencido → falta facturar porque se revirtió la factura) → la fila toma el tipo, la
 *    clave y la urgencia del corte, y respeta lo que la persona hizo con ella.
 *  - **Mismo tipo** → la regla de siempre: la urgencia sube si hace falta y nunca baja, y ni el
 *    estado ni el posponer se tocan. ⛔ Es lo que mantiene vivo el «Posponer» manual: lo que alguien
 *    pospuso a mano no se despierta porque el corte vuelva a ver lo mismo.
 *  - **Los demás tipos** (INCONSISTENCIA_CICLO, ARRANQUE_CAMBIADO…) siguen por clave, con la regla
 *    del máximo. Una INCONSISTENCIA_CICLO no es una etapa de la deuda: convive con el vencido.
 */
import type { AlertaDraft } from "./engine";

/** Las alertas del ciclo de vida de un cobro, en el orden en que la deuda avanza. */
export const FAMILIA_DEL_COBRO = [
  "COBRO_PROXIMO",
  "FACTURACION_ATRASADA",
  "COBRO_VENCIDO",
  "PROMESA_INCUMPLIDA",
] as const;

const FAMILIA = new Set<string>(FAMILIA_DEL_COBRO);

export function esDeLaFamiliaDelCobro(tipo: string): boolean {
  return FAMILIA.has(tipo);
}

type Urgencia = AlertaDraft["urgencia"];

const PESO: Record<Urgencia, number> = { BAJA: 0, MEDIA: 1, ALTA: 2 };

/** La base guarda el enum como texto; lo que no sea una urgencia conocida no pesa. */
function urgenciaDe(u: string): Urgencia | null {
  return u === "ALTA" || u === "MEDIA" || u === "BAJA" ? u : null;
}

/** Lo que el merge necesita saber de una fila viva (ABIERTA o VISTA). */
export interface FilaViva {
  id: string;
  dedupeKey: string;
  tipo: string;
  urgencia: string;
  cobroId: string | null;
  lastDetectedAt: Date;
}

export type DecisionMerge =
  | { accion: "crear" }
  | {
      accion: "fundir";
      id: string;
      tipo: AlertaDraft["tipo"];
      dedupeKey: string;
      urgencia: Urgencia;
      mensaje: string;
      evidencia: Record<string, unknown> | undefined;
      /** La alerta subió de situación (`subeDeSituacion`): la fila vuelve a ABIERTA, sin quién la vio y sin posponer. */
      reabrir: boolean;
    };

/**
 * Qué filas vivas le importan a este borrador. El cobro, si es de la familia; si no, la clave.
 * `upsertAlertas` consulta la base con esto y le pasa el resultado a `resolverMergeAlerta`.
 */
export function filasQueLeImportan(d: AlertaDraft): { dedupeKey: string; cobroDeLaFamilia: string | null } {
  return { dedupeKey: d.dedupeKey, cobroDeLaFamilia: esDeLaFamiliaDelCobro(d.tipo) && d.cobroId ? d.cobroId : null };
}

/** El reloj «¿facturaste?»: trabajo pendiente de Smarteam, todavía no deuda del cliente. */
const FALTA_FACTURAR = new Set<string>(["COBRO_PROXIMO", "FACTURACION_ATRASADA"]);

/** ¿La fila pasa a una situación que nadie vio todavía? Ver «Sube de situación» arriba. */
export function subeDeSituacion(desde: string, hacia: AlertaDraft["tipo"]): boolean {
  return hacia === "PROMESA_INCUMPLIDA" || (hacia === "COBRO_VENCIDO" && FALTA_FACTURAR.has(desde));
}

export function resolverMergeAlerta(d: AlertaDraft, vivas: readonly FilaViva[]): DecisionMerge {
  const { dedupeKey, cobroDeLaFamilia } = filasQueLeImportan(d);
  const candidatas = vivas.filter(
    (f) =>
      f.dedupeKey === dedupeKey ||
      (cobroDeLaFamilia !== null && f.cobroId === cobroDeLaFamilia && esDeLaFamiliaDelCobro(f.tipo)),
  );
  if (candidatas.length === 0) return { accion: "crear" };

  /* Si quedaron varias —filas de antes de esta regla— manda la de la misma clave; si no, la más
     reciente. Las otras no se tocan: cerrarlas es otra decisión (el cierre automático de alertas). */
  const [fila] = [...candidatas].sort(
    (a, b) =>
      Number(b.dedupeKey === dedupeKey) - Number(a.dedupeKey === dedupeKey) ||
      b.lastDetectedAt.getTime() - a.lastDetectedAt.getTime() ||
      a.id.localeCompare(b.id),
  );

  const base = {
    accion: "fundir" as const,
    id: fila.id,
    tipo: d.tipo,
    dedupeKey,
    mensaje: d.mensaje,
    evidencia: d.evidencia,
  };

  if (fila.tipo === d.tipo) {
    const previa = urgenciaDe(fila.urgencia);
    const urgencia = previa !== null && PESO[previa] > PESO[d.urgencia] ? previa : d.urgencia;
    return { ...base, urgencia, reabrir: false };
  }

  return { ...base, urgencia: d.urgencia, reabrir: subeDeSituacion(fila.tipo, d.tipo) };
}
