/**
 * lib/finanzas/caja/proyeccion.ts — «Dónde está la plata»: cuánto hay hoy y cuánto habrá al cierre del año.
 *
 * PURO: sin Prisma, sin red, sin reloj. Responde lo que Marco hace de cabeza (2026-11-13):
 *
 *     lo que hay hoy en los bancos
 *   + lo que falta cobrar (la misma proyección de la caja neta, `proyectarIngresos`)
 *   + las comisiones de aliados por cobrar (HubSpot paga el 15 de feb, may, ago y nov)
 *   − lo que sale: planilla, herramientas y costos fijos (los recurrentes de la caja neta), gastos ya anotados,
 *     pagos comprometidos y comisiones de vendedor
 *   − lo apartado (reservas): deja de estar libre HOY, aunque salga del banco en diciembre
 *   = lo libre al cierre
 *
 * Usa los MISMOS cortes que la caja neta (quincenas los dos primeros meses, después meses: `esqueletoBuckets` del
 * motor de cobranza), así que una quincena de acá y una de la caja neta cuentan lo mismo de cobros y costos.
 *
 * ⚠ CRC y USD se llevan SEPARADOS, como en todo el módulo. Lo único que los junta es «en dólares»: el saldo en colones
 * pasado a dólares con el tipo de cambio de venta del BCCR del último día que haya. Se dice en pantalla y nunca
 * reemplaza a las dos monedas.
 * ⚠ La planilla llega SUMADA (`rubro: "PLANILLA"`), nunca persona por persona: esta proyección la ve quien tiene el
 * permiso de caja, que no es el de salarios.
 */

export type Moneda = "CRC" | "USD";
export interface TotalesMoneda {
  CRC: number;
  USD: number;
}

/** Lo que entra. */
export type RubroEntra = "COBROS" | "COMISIONES";
/** Lo que sale. El orden es el de la pantalla. */
export type RubroSale = "PLANILLA" | "IMPUESTOS_Y_CARGAS" | "PAGOS" | "COMISIONES_DE_VENDEDOR" | "GASTOS" | "FIJOS" | "HERRAMIENTAS";

export const RUBROS_ENTRA: readonly RubroEntra[] = ["COBROS", "COMISIONES"];
export const RUBROS_SALE: readonly RubroSale[] = [
  "PLANILLA",
  "IMPUESTOS_Y_CARGAS",
  "PAGOS",
  "COMISIONES_DE_VENDEDOR",
  "GASTOS",
  "FIJOS",
  "HERRAMIENTAS",
];

export const ETIQUETA_DE_RUBRO: Record<RubroEntra | RubroSale, string> = {
  COBROS: "Cobros a clientes",
  COMISIONES: "Comisiones de aliados",
  PLANILLA: "Planilla",
  IMPUESTOS_Y_CARGAS: "Impuestos y cargas sociales",
  PAGOS: "Pagos comprometidos",
  COMISIONES_DE_VENDEDOR: "Comisiones de vendedor",
  GASTOS: "Gastos anotados",
  FIJOS: "Costos fijos",
  HERRAMIENTAS: "Herramientas",
};

export interface CorteBase {
  key: string;
  etiqueta: string;
  granularidad: "quincena" | "mes";
  desdeISO: string;
  hastaISO: string;
}

export interface SaldoDeCuentaInput {
  cuentaId: string;
  nombre: string;
  moneda: Moneda;
  /** null = la cuenta no tiene saldo cargado: cuenta cero y se avisa. */
  monto: number | null;
  fechaISO: string | null;
}

/** Algo con día: una comisión, un gasto, una cuota de un pago, una comisión de vendedor. */
export interface MovimientoFechado {
  fechaISO: string;
  moneda: Moneda;
  monto: number;
  rubro: RubroEntra | RubroSale;
  concepto: string;
}

export interface ReservaInput {
  id: string;
  concepto: string;
  moneda: Moneda;
  monto: number;
  /** Cuándo sale del banco. Hasta ese día está apartada; ese día sale. */
  paraISO: string;
}

export interface EntradaDeProyeccion {
  hoyISO: string;
  /** El 31 de diciembre del año de hoy. */
  cierreISO: string;
  /** Colones por dólar (venta BCCR). null = no hay tipo de cambio: no se dice nada «en dólares». */
  crcPorUsd: number | null;
  saldos: SaldoDeCuentaInput[];
  /** Los cortes de la caja neta, con lo que ella ya proyecta en cada uno. */
  cortes: Array<CorteBase & { cobros: TotalesMoneda; costos: Array<{ rubro: "PLANILLA" | "HERRAMIENTAS" | "FIJOS"; moneda: Moneda; monto: number }> }>;
  fechados: MovimientoFechado[];
  reservas: ReservaInput[];
}

/** Una salida concreta, para ordenar los pagos cuando la caja no alcanza. */
export interface SalidaProyectada {
  corteKey: string;
  /** El día, si lo tiene. Los costos recurrentes no tienen día: caen en su quincena o mes. */
  fechaISO: string | null;
  rubro: RubroSale;
  concepto: string;
  moneda: Moneda;
  monto: number;
}

export interface CorteDeCaja extends CorteBase {
  entra: Record<RubroEntra, TotalesMoneda>;
  sale: Record<RubroSale, TotalesMoneda>;
  entraTotal: TotalesMoneda;
  saleTotal: TotalesMoneda;
  /** Lo apartado que sale del banco en este corte. */
  reservasQueSalen: TotalesMoneda;
  /** Lo que habría en el banco al terminar el corte. */
  bancoAlFinal: TotalesMoneda;
  /** Lo que sigue apartado al terminar el corte (reservas para después). */
  apartadoAlFinal: TotalesMoneda;
  /** bancoAlFinal − apartadoAlFinal: lo que se puede usar. */
  libreAlFinal: TotalesMoneda;
  /** libreAlFinal en dólares. null sin tipo de cambio. */
  libreEnUsd: number | null;
}

export interface ProyeccionDeCaja {
  hoyISO: string;
  cierreISO: string;
  /** Hasta dónde llega de verdad: el cierre, o el último corte si el cierre queda más allá del horizonte. */
  hastaISO: string;
  llegaAlCierre: boolean;
  crcPorUsd: number | null;
  saldoHoy: TotalesMoneda;
  cuentasSinSaldo: string[];
  apartadoHoy: TotalesMoneda;
  libreHoy: TotalesMoneda;
  libreHoyEnUsd: number | null;
  cortes: CorteDeCaja[];
  totales: { entra: TotalesMoneda; sale: TotalesMoneda; reservas: TotalesMoneda };
  alCierre: { banco: TotalesMoneda; apartado: TotalesMoneda; libre: TotalesMoneda; libreEnUsd: number | null };
  /** El primer corte en que lo libre queda bajo cero. null = alcanza hasta `hastaISO`. */
  primerFaltante: { key: string; etiqueta: string; hastaISO: string; libre: TotalesMoneda; libreEnUsd: number | null } | null;
  salidas: SalidaProyectada[];
  /** Movimientos con fecha después de `hastaISO`: no entran a la cuenta. */
  fueraDelCierre: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const cero = (): TotalesMoneda => ({ CRC: 0, USD: 0 });
const sumar = (a: TotalesMoneda, b: TotalesMoneda): TotalesMoneda => ({ CRC: round2(a.CRC + b.CRC), USD: round2(a.USD + b.USD) });
const restar = (a: TotalesMoneda, b: TotalesMoneda): TotalesMoneda => ({ CRC: round2(a.CRC - b.CRC), USD: round2(a.USD - b.USD) });
const porRubro = <R extends string>(rubros: readonly R[]) =>
  Object.fromEntries(rubros.map((r) => [r, cero()])) as Record<R, TotalesMoneda>;
const esEntra = (r: RubroEntra | RubroSale): r is RubroEntra => r === "COBROS" || r === "COMISIONES";

/** Dos monedas en dólares, con el tipo de cambio. null sin tipo de cambio. */
export function enDolares(t: TotalesMoneda, crcPorUsd: number | null): number | null {
  if (!crcPorUsd || crcPorUsd <= 0) return null;
  return round2(t.USD + t.CRC / crcPorUsd);
}

/** El 31 de diciembre del año de `hoyISO`. */
export function cierreDelAnio(hoyISO: string): string {
  return `${hoyISO.slice(0, 4)}-12-31`;
}

export function proyectarCaja(e: EntradaDeProyeccion): ProyeccionDeCaja {
  const { hoyISO, cierreISO, crcPorUsd } = e;
  const cortes = e.cortes.filter((c) => c.desdeISO <= cierreISO);
  const hastaISO = cortes.length ? (cortes[cortes.length - 1].hastaISO < cierreISO ? cortes[cortes.length - 1].hastaISO : cierreISO) : hoyISO;
  const llegaAlCierre = cortes.length > 0 && cortes[cortes.length - 1].hastaISO >= cierreISO;

  // ── Hoy ──
  const saldoHoy = cero();
  const cuentasSinSaldo: string[] = [];
  for (const s of e.saldos) {
    if (s.monto === null) {
      cuentasSinSaldo.push(s.nombre);
      continue;
    }
    saldoHoy[s.moneda] = round2(saldoHoy[s.moneda] + s.monto);
  }
  const apartadoHoy = cero();
  for (const r of e.reservas) apartadoHoy[r.moneda] = round2(apartadoHoy[r.moneda] + r.monto);
  const libreHoy = restar(saldoHoy, apartadoHoy);

  // ── En qué corte cae cada cosa con día. Lo vencido (antes de hoy) se debe ya: va al primer corte. ──
  const corteDe = (fechaISO: string): number => {
    if (cortes.length === 0) return -1;
    if (fechaISO > hastaISO) return -1;
    const f = fechaISO < cortes[0].desdeISO ? cortes[0].desdeISO : fechaISO;
    return cortes.findIndex((c) => f >= c.desdeISO && f <= c.hastaISO);
  };

  const filas = cortes.map((c) => ({
    base: c,
    entra: porRubro(RUBROS_ENTRA),
    sale: porRubro(RUBROS_SALE),
    reservasQueSalen: cero(),
  }));
  const salidas: SalidaProyectada[] = [];
  let fueraDelCierre = 0;

  for (const [i, c] of cortes.entries()) {
    filas[i].entra.COBROS = sumar(filas[i].entra.COBROS, c.cobros);
    // Los costos recurrentes, sumados por rubro: una línea por rubro y moneda en cada corte.
    const porClave = new Map<string, SalidaProyectada>();
    for (const k of c.costos) {
      if (k.monto === 0) continue;
      filas[i].sale[k.rubro][k.moneda] = round2(filas[i].sale[k.rubro][k.moneda] + k.monto);
      const clave = `${k.rubro}:${k.moneda}`;
      const prev = porClave.get(clave);
      if (prev) prev.monto = round2(prev.monto + k.monto);
      else porClave.set(clave, { corteKey: c.key, fechaISO: null, rubro: k.rubro, concepto: `${ETIQUETA_DE_RUBRO[k.rubro]} · ${c.etiqueta}`, moneda: k.moneda, monto: round2(k.monto) });
    }
    salidas.push(...porClave.values());
  }

  for (const m of e.fechados) {
    if (m.monto === 0) continue;
    const i = corteDe(m.fechaISO);
    if (i < 0) {
      fueraDelCierre++;
      continue;
    }
    if (esEntra(m.rubro)) {
      filas[i].entra[m.rubro][m.moneda] = round2(filas[i].entra[m.rubro][m.moneda] + m.monto);
    } else {
      filas[i].sale[m.rubro][m.moneda] = round2(filas[i].sale[m.rubro][m.moneda] + m.monto);
      salidas.push({ corteKey: cortes[i].key, fechaISO: m.fechaISO < hoyISO ? hoyISO : m.fechaISO, rubro: m.rubro, concepto: m.concepto, moneda: m.moneda, monto: round2(m.monto) });
    }
  }

  const reservaEnCorte = e.reservas.map((r) => corteDe(r.paraISO));
  for (const [j, r] of e.reservas.entries()) {
    const i = reservaEnCorte[j];
    if (i >= 0) filas[i].reservasQueSalen[r.moneda] = round2(filas[i].reservasQueSalen[r.moneda] + r.monto);
  }

  // ── Corte por corte ──
  let banco = { ...saldoHoy };
  let apartado = { ...apartadoHoy };
  const totales = { entra: cero(), sale: cero(), reservas: cero() };
  let primerFaltante: ProyeccionDeCaja["primerFaltante"] = null;
  const out: CorteDeCaja[] = filas.map((f) => {
    const entraTotal = RUBROS_ENTRA.reduce((s, r) => sumar(s, f.entra[r]), cero());
    const saleTotal = RUBROS_SALE.reduce((s, r) => sumar(s, f.sale[r]), cero());
    banco = restar(sumar(banco, entraTotal), sumar(saleTotal, f.reservasQueSalen));
    apartado = restar(apartado, f.reservasQueSalen);
    const libre = restar(banco, apartado);
    const libreEnUsd = enDolares(libre, crcPorUsd);
    totales.entra = sumar(totales.entra, entraTotal);
    totales.sale = sumar(totales.sale, saleTotal);
    totales.reservas = sumar(totales.reservas, f.reservasQueSalen);
    const falta = libreEnUsd !== null ? libreEnUsd < 0 : libre.CRC < 0 || libre.USD < 0;
    if (falta && !primerFaltante) {
      primerFaltante = { key: f.base.key, etiqueta: f.base.etiqueta, hastaISO: f.base.hastaISO, libre, libreEnUsd };
    }
    return {
      ...f.base,
      entra: f.entra,
      sale: f.sale,
      entraTotal,
      saleTotal,
      reservasQueSalen: f.reservasQueSalen,
      bancoAlFinal: banco,
      apartadoAlFinal: apartado,
      libreAlFinal: libre,
      libreEnUsd,
    };
  });

  const ultimo = out[out.length - 1];
  const alCierre = ultimo
    ? { banco: ultimo.bancoAlFinal, apartado: ultimo.apartadoAlFinal, libre: ultimo.libreAlFinal, libreEnUsd: ultimo.libreEnUsd }
    : { banco: saldoHoy, apartado: apartadoHoy, libre: libreHoy, libreEnUsd: enDolares(libreHoy, crcPorUsd) };

  salidas.sort((a, b) => a.corteKey.localeCompare(b.corteKey) || (a.fechaISO ?? "").localeCompare(b.fechaISO ?? "") || a.concepto.localeCompare(b.concepto));

  return {
    hoyISO,
    cierreISO,
    hastaISO,
    llegaAlCierre,
    crcPorUsd,
    saldoHoy,
    cuentasSinSaldo,
    apartadoHoy,
    libreHoy,
    libreHoyEnUsd: enDolares(libreHoy, crcPorUsd),
    cortes: out,
    totales,
    alCierre,
    primerFaltante,
    salidas,
    fueraDelCierre,
  };
}
