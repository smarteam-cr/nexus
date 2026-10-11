/**
 * lib/rentabilidad/margen.ts — el margen de cada cuenta con sus horas reales. PURO.
 *
 * ── LA CUENTA ────────────────────────────────────────────────────────────────
 * Margen de una cuenta = lo que cobró en el período − lo que costaron sus horas. Hay tres maneras de poner precio a esas
 * horas, y la pantalla deja elegir (decisión de Elías, 2026-10-07: por persona, y que se pueda ver por equipo):
 *  - POR PERSONA (la de entrada): cada hora al costo de quien la hizo (su planilla ÷ sus horas pagadas).
 *  - POR EQUIPO: cada hora al costo promedio del equipo de quien la hizo (Customer Success, Ventas, Marketing…).
 *  - CARGADO: la planilla entera ÷ las horas que fueron a clientes. Lo que cada hora con clientes tiene que cubrir
 *    para pagar a todo el equipo (dirección, ventas, marketing, lo interno). Es el que dice si una cuenta deja plata.
 *  El DIRECTO de antes (la planilla ÷ las horas pagadas de todos) queda como el costo de una hora pagada promedio.
 *
 * ── LAS HORAS ────────────────────────────────────────────────────────────────
 * Horas reales = reuniones del calendario (cada persona que estuvo × la duración) + preparación + entrega del cronograma
 * (lo respondido en «¿cuánto te tomó?»; si no, lo estimado). Cada parte dice de dónde sale: del calendario, declarada
 * (respondida) o estimada. Horas planeadas = lo que el cronograma ponía en el período: sus sesiones (al promedio de horas que
 * cuesta una reunión con un cliente) + sus tareas. No son horas VENDIDAS: hasta guardarlas al aprobar la propuesta,
 * es lo más parecido que hay.
 *
 * ⛔ Este módulo no convierte monedas: recibe todo en dólares (lo convierte el cargador con la tasa de cada mes).
 */

export type Periodo = "mes" | "trimestre" | "anio";

/** Cómo se le pone precio a una hora (ver arriba). */
export type ModoDeCosto = "persona" | "equipo" | "cargado";

export const ETIQUETA_DEL_MODO: Record<ModoDeCosto, string> = {
  persona: "Por persona",
  equipo: "Por equipo",
  cargado: "Cargado",
};

/** Los equipos de Smarteam por rol, para el costo de la hora «por equipo». */
export const EQUIPO_DEL_ROL: Record<string, string> = {
  CSE: "Customer Success",
  CSL: "Customer Success",
  VENTAS: "Ventas",
  MARKETING: "Marketing",
  DEV: "Desarrollo",
  ADMIN: "Finanzas y administración",
  SUPER_ADMIN: "Dirección",
};

export const ETIQUETA_DEL_PERIODO: Record<Periodo, string> = {
  mes: "Mes",
  trimestre: "Trimestre",
  anio: "En el año",
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const HORA_CR_MS = 6 * 3_600_000;

export interface RangoDelPeriodo {
  periodo: Periodo;
  /** «2026-07», … del más viejo al más nuevo. Siempre meses completos que ya cerraron. */
  meses: string[];
  /** Instantes (UTC) de inicio y fin, en hora de Costa Rica. */
  desde: Date;
  hasta: Date;
  etiqueta: string;
}

function sumarMeses(periodo: string, n: number): string {
  const [a, m] = periodo.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

const inicioDelMes = (periodo: string) => new Date(Date.parse(`${periodo}-01T00:00:00Z`) + HORA_CR_MS);

/** El rango de un solo mes («2026-08»), para mirar una cuenta mes a mes. */
export function rangoDelMes(mes: string): RangoDelPeriodo {
  return { periodo: "mes", meses: [mes], desde: inicioDelMes(mes), hasta: inicioDelMes(sumarMeses(mes, 1)), etiqueta: `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}` };
}

/** El rango de un período: el último mes cerrado, los últimos tres, o del 1 de enero al último mes cerrado. */
export function rangoDelPeriodo(periodo: Periodo, hoy: Date): RangoDelPeriodo {
  const cr = new Date(+hoy - HORA_CR_MS);
  const actual = `${cr.getUTCFullYear()}-${String(cr.getUTCMonth() + 1).padStart(2, "0")}`;
  const ultimo = sumarMeses(actual, -1);
  const primero = periodo === "mes" ? ultimo : periodo === "trimestre" ? sumarMeses(ultimo, -2) : `${ultimo.slice(0, 4)}-01`;
  const meses: string[] = [];
  for (let m = primero; m <= ultimo; m = sumarMeses(m, 1)) meses.push(m);
  const nombre = (p: string) => MESES[Number(p.slice(5, 7)) - 1];
  const etiqueta = meses.length === 1 ? `${nombre(primero)} ${primero.slice(0, 4)}` : `${nombre(primero)} – ${nombre(ultimo)} ${ultimo.slice(0, 4)}`;
  return { periodo, meses, desde: inicioDelMes(primero), hasta: inicioDelMes(sumarMeses(ultimo, 1)), etiqueta };
}

// ── El costo de una persona en un mes ────────────────────────────────────────

export type Moneda = "CRC" | "USD";

export interface EntradaDeCostoDelMes {
  periodo: string;
  /** Lo pagado ese mes según el libro de planilla. */
  pagos: Array<{ quincena: number; monto: number; moneda: Moneda }>;
  /** El salario registrado como costo recurrente, si lo hay. */
  salario: { monto: number; moneda: Moneda; frecuencia: "MENSUAL" | "ANUAL"; finalizadoEl: Date | null } | null;
  alta: Date | null;
  baja: Date | null;
}

export type FuenteDelCosto = "libro" | "libro-media" | "costo-recurrente";

export interface CostoDelMes {
  monto: number;
  moneda: Moneda;
  fuente: FuenteDelCosto;
}

/**
 * Lo que costó una persona en un mes, en su moneda. El libro de planilla manda (lo que se pagó); con una sola quincena
 * pagada y la persona todavía en el equipo al cerrar el mes, se cuenta dos veces (la otra está por pagarse). Sin
 * libro, el salario registrado, proporcional a los días en que estuvo. Sin ninguno de los dos, null: no se adivina.
 * ⚠ Sin la reserva de aguinaldo: la suma el cargador (`conAguinaldo`).
 */
export function costoDelMes(e: EntradaDeCostoDelMes): CostoDelMes | null {
  const ini = inicioDelMes(e.periodo);
  const fin = inicioDelMes(sumarMeses(e.periodo, 1));
  const pagos = e.pagos.filter((p) => p.monto > 0);
  if (pagos.length > 0) {
    const moneda = pagos[0].moneda;
    const suma = pagos.filter((p) => p.moneda === moneda).reduce((a, p) => a + p.monto, 0);
    const quincenas = new Set(pagos.map((p) => p.quincena)).size;
    if (quincenas >= 2) return { monto: suma, moneda, fuente: "libro" };
    const sigue = !e.baja || e.baja >= fin;
    return sigue ? { monto: suma * 2, moneda, fuente: "libro-media" } : { monto: suma, moneda, fuente: "libro" };
  }
  if (e.salario) {
    const mensual = e.salario.frecuencia === "ANUAL" ? e.salario.monto / 12 : e.salario.monto;
    const desde = Math.max(+ini, e.alta ? +e.alta : +ini);
    const hasta = Math.min(+fin, e.salario.finalizadoEl ? +e.salario.finalizadoEl : Infinity, e.baja ? +e.baja : Infinity);
    const fraccion = Math.max(0, Math.min(1, (hasta - desde) / (+fin - +ini)));
    if (fraccion <= 0) return null;
    return { monto: mensual * fraccion, moneda: e.salario.moneda, fuente: "costo-recurrente" };
  }
  return null;
}

/** La reserva de aguinaldo: un mes más por año (13 pagos en 12 meses). */
export const conAguinaldo = (monto: number) => (monto * 13) / 12;

/** Horas pagadas de una persona en el período: horas de contrato × las semanas en que estuvo en el equipo. */
export function horasPagadas(horasPorSemana: number, rango: { desde: Date; hasta: Date }, alta: Date | null, baja: Date | null): number {
  const desde = Math.max(+rango.desde, alta ? +alta : +rango.desde);
  const hasta = Math.min(+rango.hasta, baja ? +baja : Infinity);
  const semanas = Math.max(0, (hasta - desde) / (7 * 86_400_000));
  return horasPorSemana * semanas;
}

// ── El margen de las cuentas ─────────────────────────────────────────────────

export interface CuentaParaMargen {
  clienteId: string;
  nombre: string;
  cse: string | null;
  /** Cobrado o facturado en el período, en dólares. */
  ingreso: number;
  fuenteDelIngreso: "Cobranza" | "Odoo" | null;
  /** `declarada` es la parte de `entrega` que respondió quien hizo la tarea (el resto de la entrega es estimado). */
  horas: { reuniones: number; preparacion: number; entrega: number; declarada?: number };
  reuniones: number;
  /** Lo que el cronograma ponía en el período, o null si no tenía nada. */
  plan: { sesiones: number; horasTareas: number } | null;
  /**
   * Lo que costaron sus horas al costo de cada persona y al de su equipo, en dólares. Una persona sin planilla ni
   * salario en el período va al costo de una hora pagada promedio (y la pantalla avisa que hay gente sin costo).
   */
  costos?: { persona: number; equipo: number };
  /** El factor de complejidad de la cuenta (1 si no está en la cartera). */
  factor?: number;
  /** Quién la atendió: horas de cada persona (reuniones, preparación y entrega), por correo. */
  porPersona?: Array<{ email: string; horas: number }>;
}

export interface TotalesDelPeriodo {
  /** Planilla del período en dólares, con la reserva de aguinaldo. */
  planilla: number;
  horasPagadas: number;
  /** Horas con clientes de todo el equipo (reuniones + preparación + entrega). */
  horasConClientes: number;
  /** Cobrado o facturado a clientes en el período. */
  ingreso: number;
  /** Horas-persona que cuesta en promedio una reunión con un cliente (para valorar las sesiones del plan). */
  horasPorSesion: number;
}

export interface CostoDeLaHora {
  directo: number | null;
  cargado: number | null;
  ingresoPorHora: number | null;
  /** Parte de las horas pagadas que fue a clientes, de 0 a 1. */
  parteAClientes: number | null;
}

export function costoDeLaHora(t: TotalesDelPeriodo): CostoDeLaHora {
  return {
    directo: t.horasPagadas > 0 ? t.planilla / t.horasPagadas : null,
    cargado: t.horasConClientes > 0 ? t.planilla / t.horasConClientes : null,
    ingresoPorHora: t.horasConClientes > 0 ? t.ingreso / t.horasConClientes : null,
    parteAClientes: t.horasPagadas > 0 ? t.horasConClientes / t.horasPagadas : null,
  };
}

export type RealContraPlan = "sin-plan" | "mas" | "cerca" | "menos";

export interface FilaDeMargen {
  clienteId: string;
  nombre: string;
  cse: string | null;
  ingreso: number;
  fuenteDelIngreso: "Cobranza" | "Odoo" | null;
  horas: number;
  desglose: { reuniones: number; preparacion: number; entrega: number; declarada?: number };
  /** Lo que costó una hora de esta cuenta con el modo elegido (costo ÷ horas). */
  tarifa: number;
  /** Cobrado por cada hora usada. */
  porHora: number | null;
  costo: number;
  margen: number;
  /** Margen ÷ ingreso, de −∞ a 1. null sin ingreso. */
  margenPct: number | null;
  horasPlaneadas: number | null;
  margenPlaneado: number | null;
  realContraPlan: RealContraPlan;
  /** horas reales ÷ planeadas. */
  razonContraPlan: number | null;
  /** La cuenta no tiene tareas en el período: su trabajo fuera de reunión no se ve y sus horas salen bajas. */
  sinEntregaEstimada: boolean;
}

/**
 * El costo de las horas de una cuenta con el modo elegido. `tarifa` es la del modo cargado (o la que se pase cuando la
 * cuenta no trae sus costos por persona y por equipo).
 */
export function costoDeLaCuenta(c: CuentaParaMargen, modo: ModoDeCosto, tarifa: number): number {
  const horas = c.horas.reuniones + c.horas.preparacion + c.horas.entrega;
  if (modo === "persona" && c.costos) return c.costos.persona;
  if (modo === "equipo" && c.costos) return c.costos.equipo;
  return horas * tarifa;
}

/**
 * Una fila por cuenta, con el costo de la hora elegido. `tarifa` = la del modo cargado. Las horas planeadas se valoran a
 * lo que costó una hora REAL de esta cuenta con el mismo modo (o a la tarifa, si no usó horas).
 */
export function filaDeMargen(c: CuentaParaMargen, tarifa: number, horasPorSesion: number, modo: ModoDeCosto = "cargado"): FilaDeMargen {
  const horas = c.horas.reuniones + c.horas.preparacion + c.horas.entrega;
  const costo = costoDeLaCuenta(c, modo, tarifa);
  const tarifaDeLaCuenta = horas > 0 ? costo / horas : tarifa;
  const margen = c.ingreso - costo;
  const horasPlaneadas = c.plan ? c.plan.sesiones * horasPorSesion + c.plan.horasTareas : null;
  const razon = horasPlaneadas && horasPlaneadas > 0 ? horas / horasPlaneadas : null;
  const realContraPlan: RealContraPlan = razon === null ? "sin-plan" : razon >= 1.5 ? "mas" : razon <= 0.75 ? "menos" : "cerca";
  return {
    clienteId: c.clienteId,
    nombre: c.nombre,
    cse: c.cse,
    ingreso: c.ingreso,
    fuenteDelIngreso: c.fuenteDelIngreso,
    horas,
    desglose: c.horas,
    tarifa: tarifaDeLaCuenta,
    porHora: horas > 0 && c.ingreso > 0 ? c.ingreso / horas : null,
    costo,
    margen,
    margenPct: c.ingreso > 0 ? margen / c.ingreso : null,
    horasPlaneadas,
    margenPlaneado: horasPlaneadas !== null && c.ingreso > 0 ? c.ingreso - horasPlaneadas * tarifaDeLaCuenta : null,
    realContraPlan,
    razonContraPlan: razon,
    sinEntregaEstimada: c.horas.entrega === 0,
  };
}

/** Las cuentas con ingreso (por ingreso, de mayor a menor) y las que usaron horas sin cobrar (por horas). */
export function tablaDeMargen(
  cuentas: CuentaParaMargen[],
  tarifa: number,
  horasPorSesion: number,
  modo: ModoDeCosto = "cargado",
): { conIngreso: FilaDeMargen[]; sinIngreso: FilaDeMargen[] } {
  const filas = cuentas.map((c) => filaDeMargen(c, tarifa, horasPorSesion, modo));
  return {
    conIngreso: filas.filter((f) => f.ingreso > 0).sort((a, b) => b.ingreso - a.ingreso),
    sinIngreso: filas.filter((f) => f.ingreso <= 0 && f.horas >= 1).sort((a, b) => b.horas - a.horas),
  };
}
