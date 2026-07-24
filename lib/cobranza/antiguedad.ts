/**
 * lib/cobranza/antiguedad.ts
 *
 * Antigüedad de la cartera: en qué cubo cae cada cobro y cuánta plata hay en cada
 * uno. PURO (sin Prisma ni red) — lo consumen la cola de cobros y el panel de
 * reportes, así que la clasificación tiene que poder testearse sola.
 *
 * Por qué existe: la lista de cobros agrupaba por el COLOR del semáforo, y
 * `semaforoCobro` —por diseño de los dos relojes— nunca marca vencido un cobro sin
 * `fechaEmision` ("no facturar es trabajo de Smarteam, no mora del cliente"). El
 * efecto era que todo lo atrasado-sin-facturar caía en "Esta quincena" (15 cobros
 * el 2026-07-24, el más viejo de mayo). Acá se agrupa por FECHA + FACTURACIÓN, que
 * es otra pregunta. El semáforo no se toca: sigue gobernando el color del chip.
 *
 * Los cortes 30/60/90 son los MISMOS del motor (`computeMetricasCartera`), que
 * ahora los importa de acá: una sola definición, imposible que la cola y los
 * reportes discrepen.
 */
import {
  bucketAntiguedad,
  diffDays,
  finQuincenaISO,
  semaforoCobro,
  DEFAULT_CREDITO_DIAS,
} from "./engine";

// Reexportado para que la UI tenga un único punto de entrada (`antiguedad`) sin
// tener que saber que la definición vive en el motor.
export { bucketAntiguedad };

// ── Umbrales ────────────────────────────────────────────────────────────────────

/**
 * Crédito estándar de la casa. Un cobro que pasa de acá sin entrar es el que
 * dispara el KPI ("los créditos no deberían superar los 30 días"). Distinto de
 * `DEFAULT_CREDITO_DIAS` (15), que es el plazo que se le da al cliente DESDE que
 * se emite la factura: este es el techo de tolerancia del negocio, medido desde
 * que el cobro estaba programado.
 */
export const KPI_CREDITO_DIAS = 30;

// ── Cubos de antigüedad ─────────────────────────────────────────────────────────

export type BucketAntiguedad = ReturnType<typeof bucketAntiguedad>;

export const BUCKETS_ORDEN: BucketAntiguedad[] = ["d90mas", "d61_90", "d31_60", "d0_30"];

export const BUCKET_LABEL: Record<BucketAntiguedad, string> = {
  d90mas: "Más de 90 días",
  d61_90: "61 a 90 días",
  d31_60: "31 a 60 días",
  d0_30: "Hasta 30 días",
};

/** ¿Este cubo cuenta para el KPI de "vencido a más de 30 días"? */
export function superaCreditoEstandar(b: BucketAntiguedad): boolean {
  return b !== "d0_30";
}

// ── Clasificación de un cobro ───────────────────────────────────────────────────

/** Grupos de la cola, en el orden en que se muestran (lo más viejo primero). */
export type GrupoCobro =
  | "sinFacturar"
  | BucketAntiguedad
  | "quincena"
  | "adelante";

export const GRUPOS_ORDEN: GrupoCobro[] = [
  "sinFacturar",
  ...BUCKETS_ORDEN,
  "quincena",
  "adelante",
];

/** Lo mínimo que necesita la clasificación (subconjunto de ColaCobroRow). */
export interface CobroClasificable {
  estado: string;
  fechaProgramada: string; // ISO date
  fechaEmision: string | null;
  promesaPago?: string | null;
  monto: number;
  moneda: string;
  creditoDias?: number;
}

/**
 * En qué grupo cae un cobro. El ORDEN de las preguntas es la regla de negocio:
 *
 *  1. ¿Se le pasó la fecha y NUNCA se facturó? → `sinFacturar`. Va primero y
 *     aparte porque el cliente todavía no debe nada: reclamarle sería un error,
 *     lo que falta es que salga la factura. Es trabajo de Smarteam.
 *  2. ¿El semáforo lo da por vencido? → al cubo que le toque por antigüedad. Se
 *     respeta la definición canónica de "vencido" (dos relojes: factura emitida +
 *     crédito consumido), solo que ahora se subdivide.
 *  3. ¿Su fecha cae después de esta quincena? → `adelante`.
 *  4. Si no, es lo que toca cobrar ahora → `quincena`.
 *
 * La edad para el cubo se mide desde la fecha PROGRAMADA (no desde la emisión):
 * es el mismo número que la lista ya muestra como "hace N d" y el que usa el
 * snapshot, así que la pantalla y el reporte cuentan la misma historia.
 */
export function clasificarCobro(c: CobroClasificable, todayISO: string): GrupoCobro {
  const edad = diffDays(c.fechaProgramada, todayISO); // >0 = ya pasó

  if (edad > 0 && !c.fechaEmision) return "sinFacturar";

  const sem = semaforoCobro(
    {
      estado: c.estado,
      fechaProgramadaISO: c.fechaProgramada,
      fechaEmisionISO: c.fechaEmision,
      promesaPagoISO: c.promesaPago ?? null,
    },
    todayISO,
    c.creditoDias ?? DEFAULT_CREDITO_DIAS,
  );
  if (sem === "rojo") return bucketAntiguedad(edad);

  return c.fechaProgramada > finQuincenaISO(todayISO) ? "adelante" : "quincena";
}

// ── Resumen por moneda ──────────────────────────────────────────────────────────

export interface ResumenMoneda {
  /** Monto por cubo de antigüedad (solo lo VENCIDO). */
  aging: Record<BucketAntiguedad, number>;
  /** Cobros por cubo. */
  conteo: Record<BucketAntiguedad, number>;
  totalVencido: number;
  nVencidos: number;
  /** KPI: plata vencida que ya pasó el crédito estándar de 30 días. */
  vencido30mas: number;
  n30mas: number;
  /** KPI: días promedio de cobro ponderados por monto (DSO). null = sin exigibles. */
  dso: number | null;
  /** Atrasado y sin factura emitida — pendiente de Smarteam, no del cliente. */
  sinFacturar: number;
  nSinFacturar: number;
}

export type ResumenAntiguedad = Record<string, ResumenMoneda>;

const vacio = (): ResumenMoneda => ({
  aging: { d0_30: 0, d31_60: 0, d61_90: 0, d90mas: 0 },
  conteo: { d0_30: 0, d31_60: 0, d61_90: 0, d90mas: 0 },
  totalVencido: 0,
  nVencidos: 0,
  vencido30mas: 0,
  n30mas: 0,
  dso: null,
  sinFacturar: 0,
  nSinFacturar: 0,
});

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Agrega la cartera pendiente por MONEDA. Nunca se suman monedas distintas ni se
 * convierten entre sí (invariante del módulo) — por eso el resultado es un mapa
 * y no un total.
 *
 * El DSO usa la misma aritmética que `computeMetricasCartera`: promedio de días
 * de atraso PONDERADO POR MONTO sobre los exigibles (fecha programada ya llegada).
 * Los futuros no entran, para que no diluyan el indicador.
 */
export function resumenAntiguedad(
  rows: CobroClasificable[],
  todayISO: string,
): ResumenAntiguedad {
  const out: ResumenAntiguedad = {};
  const dso: Record<string, { peso: number; suma: number }> = {};

  for (const c of rows) {
    if (c.estado === "COBRADO") continue; // la cola ya los excluye; red por si acaso
    const m = (out[c.moneda] ??= vacio());
    (dso[c.moneda] ??= { peso: 0, suma: 0 });

    const edad = diffDays(c.fechaProgramada, todayISO);
    if (edad >= 0) {
      dso[c.moneda].peso += c.monto;
      dso[c.moneda].suma += edad * c.monto;
    }

    const g = clasificarCobro(c, todayISO);
    if (g === "sinFacturar") {
      m.sinFacturar = round2(m.sinFacturar + c.monto);
      m.nSinFacturar++;
      continue;
    }
    if (g === "quincena" || g === "adelante") continue;

    m.aging[g] = round2(m.aging[g] + c.monto);
    m.conteo[g]++;
    m.totalVencido = round2(m.totalVencido + c.monto);
    m.nVencidos++;
    if (superaCreditoEstandar(g)) {
      m.vencido30mas = round2(m.vencido30mas + c.monto);
      m.n30mas++;
    }
  }

  for (const [moneda, acc] of Object.entries(dso)) {
    if (acc.peso > 0) out[moneda].dso = round1(acc.suma / acc.peso);
  }
  return out;
}

// ── Tandas de cobro ─────────────────────────────────────────────────────────────

/**
 * Smarteam cobra en DOS tandas fijas al mes: del 1 al 5 y del 15 al 20. Son
 * VENTANAS DE TRABAJO — definen cuándo se arma la lista y cuándo corre el corte,
 * NO mueven la fecha de ningún cobro (decisión explícita: la cartera cargada
 * conserva sus fechas del 15 y del 30).
 */
export const TANDAS = [
  { id: 1 as const, desde: 1, hasta: 5, label: "Primera tanda · del 1 al 5" },
  { id: 2 as const, desde: 15, hasta: 20, label: "Segunda tanda · del 15 al 20" },
];

export interface EstadoTanda {
  /** La tanda vigente hoy, o null si estamos entre ventanas. */
  activa: (typeof TANDAS)[number] | null;
  /** Día del mes en que abre la próxima ventana (o la actual si ya está abierta). */
  proximaDesde: number;
  /** Días que faltan para que abra la próxima (0 si ya está abierta). */
  diasParaProxima: number;
}

/** Día del mes (UTC) de una fecha ISO — sin construir Date locales. */
function diaDelMes(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function estadoTanda(todayISO: string): EstadoTanda {
  const d = diaDelMes(todayISO);
  const activa = TANDAS.find((t) => d >= t.desde && d <= t.hasta) ?? null;
  if (activa) return { activa, proximaDesde: activa.desde, diasParaProxima: 0 };
  // Entre ventanas: la próxima es la 2ª si todavía no llegó, si no la 1ª del mes que viene.
  const siguiente = TANDAS.find((t) => t.desde > d);
  if (siguiente) {
    return { activa: null, proximaDesde: siguiente.desde, diasParaProxima: siguiente.desde - d };
  }
  // Pasó la 2ª tanda: la próxima es el 1 del mes siguiente.
  const ultimoDia = new Date(
    Date.UTC(Number(todayISO.slice(0, 4)), Number(todayISO.slice(5, 7)), 0),
  ).getUTCDate();
  return { activa: null, proximaDesde: 1, diasParaProxima: ultimoDia - d + 1 };
}

/** ¿Hoy toca corte? Arranque de cada tanda — es el disparo del cron quincenal. */
export function esDiaDeCorte(todayISO: string): boolean {
  const d = diaDelMes(todayISO);
  return TANDAS.some((t) => t.desde === d);
}
