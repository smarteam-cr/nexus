/**
 * lib/cobranza/estado-de-cuenta.ts — el ESTADO DE CUENTA que ve el cliente (pedido 17, 2026-11-13): lo facturado, lo
 * pagado, lo pendiente y lo vencido de UNA cuenta, por moneda, y sus facturas. PURO: sin Prisma, sin red, sin reloj
 * (hoy entra por parámetro) y sin Intl (el texto no puede cambiar con el locale del servidor).
 *
 * Lo arma el chokepoint de la página pública (lib/external/estado-de-cuenta-view.ts) y nada más: lo que no está en
 * `CuotaDeLaCuenta` no puede llegar al cliente, porque este módulo no lo recibe.
 *
 * ── LAS REGLAS (las de la cola, no otras) ───────────────────────────────────────
 * - Una cuota PAGADA (`COBRADO`) cuenta como facturada y pagada, tenga o no la fecha de emisión (dos del histórico
 *   no la tienen): así «Facturado = Pagado + Por pagar» al centavo y el cliente puede cuadrarlo.
 * - Una cuota sin factura y sin pagar NO sale: lo que no se facturó no es deuda del cliente (DECISIONS «Cobranza —
 *   criterio ÚNICO de "vencido"»), y su fecha es un plan interno que puede moverse.
 * - Facturada y sin pagar: VENCIDA si se consumió el crédito de la cuenta (`semaforoCobro` rojo: emisión + días de
 *   crédito ya pasaron), POR VENCER si no. La misma regla del semáforo, la cola y «Quién nos debe».
 * - `SIN_DATO` no sale: falta información para saber en qué está, y al cliente no se le muestra una suposición.
 * - ⛔ Nunca se suman ni se convierten monedas: un bloque de totales por moneda.
 * - ⛔ Ni la promesa de pago, ni las notas, ni quién facturó o confirmó, ni el número de depósito: son de Smarteam.
 * - Los montos son los del SERVICIO, sin impuestos (lib/cobranza/monto-neto.test.ts): la página lo dice.
 */
import { DEFAULT_CREDITO_DIAS, addDaysISO, diffDays, semaforoCobro } from "./engine";
import { centavos } from "./montos";

/**
 * Cuánto abre el enlace del estado de cuenta desde que se crea o se extiende (lib/cobranza/estado-de-cuenta-compartir.ts).
 * Un trimestre: la página muestra la deuda EN VIVO, y un enlace olvidado en un buzón no debería seguir abriendo para siempre.
 */
export const DIAS_DE_VIGENCIA = 90;

/** Lo ÚNICO que el estado de cuenta sabe de cada cuota. Agregar un campo acá es decidir que el cliente lo ve. */
export interface CuotaDeLaCuenta {
  estado: string;
  /** "YYYY-MM": el mes que cubre. */
  periodo: string;
  /** `YYYY-MM-DD`. */
  fechaProgramada: string;
  fechaEmision: string | null;
  fechaCobro: string | null;
  numeroFactura: string | null;
  monto: number;
  moneda: string;
  tipoServicio: string;
}

export type EstadoDeLaFactura = "pagada" | "vencida" | "porVencer";

export interface FacturaDelEstado {
  numero: string | null;
  concepto: string;
  /** "Septiembre 2026". */
  periodo: string;
  emitida: string | null;
  /** Emisión + días de crédito. null si no hay emisión. */
  vence: string | null;
  pagada: string | null;
  monto: number;
  moneda: string;
  estado: EstadoDeLaFactura;
  /** Días desde que venció; solo en las vencidas. */
  diasVencida: number | null;
}

export interface TotalesDeMoneda {
  moneda: string;
  facturado: number;
  pagado: number;
  /** Lo que falta pagar: por vencer + vencido. */
  porPagar: number;
  /** La parte de `porPagar` que ya venció. */
  vencido: number;
  nVencidas: number;
}

export interface EstadoDeCuenta {
  hoy: string;
  creditoDias: number;
  totales: TotalesDeMoneda[];
  /** Vencidas primero (la más vieja arriba), después las por vencer. */
  porPagar: FacturaDelEstado[];
  /** La más reciente arriba. */
  pagadas: FacturaDelEstado[];
}

export const CONCEPTO_DEL_SERVICIO: Record<string, string> = {
  SUSCRIPCION: "Suscripción",
  IMPLEMENTACION: "Implementación",
  WEB: "Sitio web",
  SOPORTE: "Soporte",
  CRM: "CRM",
  CONECTOR: "Conector",
  OTRO: "Servicio",
};

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-09" → "Septiembre 2026". Lo que no tiene esa forma sale tal cual. */
export function mesDelPeriodo(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  const i = m ? Number(m[2]) - 1 : -1;
  return m && i >= 0 && i < 12 ? `${MESES[i]} ${m[1]}` : periodo;
}

/** "2026-09-15" → "15 sep 2026". */
export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d || m > 12) return iso;
  return `${d} ${MESES_CORTOS[m - 1]} ${y}`;
}

const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
const suma = (a: number, b: number) => (centavos(a) + centavos(b)) / 100;

/** El orden de las monedas: la de la cuenta primero, después las demás por nombre. */
function ordenDeMonedas(monedas: string[], principal: string | null): string[] {
  return [...monedas].sort((a, b) => (a === principal ? -1 : b === principal ? 1 : a.localeCompare(b)));
}

export function armarEstadoDeCuenta(
  cuotas: readonly CuotaDeLaCuenta[],
  opciones: { hoy: string; creditoDias: number | null; monedaDeLaCuenta: string | null },
): EstadoDeCuenta {
  const { hoy } = opciones;
  const creditoDias = opciones.creditoDias ?? DEFAULT_CREDITO_DIAS;
  const totales = new Map<string, TotalesDeMoneda>();
  const porPagar: FacturaDelEstado[] = [];
  const pagadas: FacturaDelEstado[] = [];

  for (const c of cuotas) {
    if (c.estado === "SIN_DATO") continue;
    const pagada = c.estado === "COBRADO";
    const emitida = dia(c.fechaEmision);
    if (!pagada && !emitida) continue; // sin factura: no es deuda

    const vence = emitida ? addDaysISO(emitida, creditoDias) : null;
    const vencida =
      !pagada && semaforoCobro({ estado: c.estado, fechaProgramadaISO: dia(c.fechaProgramada)!, fechaEmisionISO: emitida }, hoy, creditoDias) === "rojo";
    const factura: FacturaDelEstado = {
      numero: c.numeroFactura?.trim() || null,
      concepto: CONCEPTO_DEL_SERVICIO[c.tipoServicio] ?? "Servicio",
      periodo: mesDelPeriodo(c.periodo),
      emitida,
      vence,
      pagada: pagada ? dia(c.fechaCobro) : null,
      monto: c.monto,
      moneda: c.moneda,
      estado: pagada ? "pagada" : vencida ? "vencida" : "porVencer",
      diasVencida: vencida && vence ? diffDays(vence, hoy) : null,
    };

    const t = totales.get(c.moneda) ?? { moneda: c.moneda, facturado: 0, pagado: 0, porPagar: 0, vencido: 0, nVencidas: 0 };
    t.facturado = suma(t.facturado, c.monto);
    if (pagada) {
      t.pagado = suma(t.pagado, c.monto);
      pagadas.push(factura);
    } else {
      t.porPagar = suma(t.porPagar, c.monto);
      if (vencida) {
        t.vencido = suma(t.vencido, c.monto);
        t.nVencidas += 1;
      }
      porPagar.push(factura);
    }
    totales.set(c.moneda, t);
  }

  const peso = (f: FacturaDelEstado) => (f.estado === "vencida" ? 0 : 1);
  porPagar.sort((a, b) => peso(a) - peso(b) || (a.vence ?? "").localeCompare(b.vence ?? "") || (a.numero ?? "").localeCompare(b.numero ?? ""));
  pagadas.sort((a, b) => (b.pagada ?? b.emitida ?? "").localeCompare(a.pagada ?? a.emitida ?? "") || (b.numero ?? "").localeCompare(a.numero ?? ""));

  return {
    hoy,
    creditoDias,
    totales: ordenDeMonedas([...totales.keys()], opciones.monedaDeLaCuenta).map((m) => totales.get(m)!),
    porPagar,
    pagadas,
  };
}
