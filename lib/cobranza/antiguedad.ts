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
  marcaPromesa,
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

  /* ⛔ Sin la promesa: una factura vencida con promesa vigente sigue en su cubo (decisión de Alex,
     2026-09-12). La promesa se cuenta aparte, como marca, en `resumenAntiguedad`. */
  const sem = semaforoCobro(
    {
      estado: c.estado,
      fechaProgramadaISO: c.fechaProgramada,
      fechaEmisionISO: c.fechaEmision,
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
  /** KPI: días promedio de cobro ponderados por monto (DSO), SOLO sobre lo ya
   *  facturado. null = no hay nada facturado y exigible (no es 0: cero mentiría). */
  dso: number | null;
  /** Atrasado y sin factura emitida — pendiente de Smarteam, no del cliente. */
  sinFacturar: number;
  nSinFacturar: number;
  /**
   * La parte de `totalVencido` que tiene una promesa de pago VIGENTE. Ya está dentro del vencido:
   * no se suma aparte. Existe para que registrar una promesa se vea sin achicar la deuda.
   */
  vencidoConPromesa: number;
  nVencidoConPromesa: number;
  /** Facturas cuya fecha prometida pasó sin depósito, estén o no vencidas por crédito. */
  promesaIncumplida: number;
  nPromesaIncumplida: number;
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
  vencidoConPromesa: 0,
  nVencidoConPromesa: 0,
  promesaIncumplida: 0,
  nPromesaIncumplida: 0,
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

    // DSO solo sobre lo FACTURADO (decisión de Finanzas 2026-07-24): mide cuánto
    // tarda el CLIENTE en pagar, no cuánto tardamos en emitir. Mezclarlos bajaba el
    // indicador (96,1 d en vez de 108,8 d) porque lo sin facturar es más reciente.
    // Misma regla que `computeMetricasCartera`: el KPI de la cola y el del corte
    // tienen que dar el mismo número.
    const edad = diffDays(c.fechaProgramada, todayISO);
    if (edad >= 0 && c.fechaEmision) {
      dso[c.moneda].peso += c.monto;
      dso[c.moneda].suma += edad * c.monto;
    }

    // La promesa se cuenta como MARCA: nunca resta del vencido. La incumplida se cuenta antes de
    // mirar el grupo porque puede caer fuera del vencido (prometió antes de que corriera el crédito).
    const marca = marcaPromesa(
      { estado: c.estado, fechaEmisionISO: c.fechaEmision, promesaPagoISO: c.promesaPago ?? null },
      todayISO,
    );
    if (marca === "incumplida") {
      m.promesaIncumplida = round2(m.promesaIncumplida + c.monto);
      m.nPromesaIncumplida++;
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
    if (marca === "vigente") {
      m.vencidoConPromesa = round2(m.vencidoConPromesa + c.monto);
      m.nVencidoConPromesa++;
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

/**
 * Cuántos días puede tener el último corte antes de que su foto se considere vieja. Entre dos
 * cortes seguidos hay como mucho 17: del 15 al 1 del mes siguiente, en un mes de 31 días.
 *
 * Existe porque el corte automático nunca se encendió y nadie lo notó: hasta el 2026-09-12 había
 * UN corte, del 24-jul, y las alertas de cobranza eran una foto de ese día. Lo usan INV32 y la
 * pestaña Corte quincenal.
 */
export const DIAS_MAXIMOS_ENTRE_CORTES = 17;

/** ¿El último corte (día de Costa Rica, `YYYY-MM-DD`) es más viejo de lo que puede haber entre dos cortes? */
export function corteVencido(ultimoCorteISO: string, hoyISO: string): boolean {
  return diffDays(ultimoCorteISO.slice(0, 10), hoyISO.slice(0, 10)) > DIAS_MAXIMOS_ENTRE_CORTES;
}

/**
 * El próximo día de corte DESPUÉS de hoy: el 15 si todavía no llegó; si no, el 1 del mes siguiente.
 * Si hoy ES día de corte, el siguiente: el corte de hoy proyecta hasta el próximo.
 *
 * ⚠ Existe porque el corte proyectaba «hasta dentro de 7 días», herencia de cuando era semanal. Con
 * cortes cada quince días, «Cobrado vs proyectado» comparaba una semana de proyección contra una
 * quincena de cobrado. Los días salen de `TANDAS`, la misma definición que `esDiaDeCorte`.
 */
export function proximoDiaDeCorteISO(todayISO: string): string {
  const dias = TANDAS.map((t) => t.desde);
  const d = diaDelMes(todayISO);
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  const posteriores = dias.filter((x) => x > d);
  if (posteriores.length > 0) return `${todayISO.slice(0, 7)}-${dosDigitos(Math.min(...posteriores))}`;
  const anio = Number(todayISO.slice(0, 4));
  const mes = Number(todayISO.slice(5, 7));
  const primero = dosDigitos(Math.min(...dias));
  return mes === 12 ? `${anio + 1}-01-${primero}` : `${anio}-${dosDigitos(mes + 1)}-${primero}`;
}
