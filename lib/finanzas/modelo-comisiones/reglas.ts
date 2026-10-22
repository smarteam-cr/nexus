/**
 * lib/finanzas/modelo-comisiones/reglas.ts — el modelo de comisiones que Elías cerró con Marco el 2026-10-21, como
 * cálculo. PURO.
 *
 * Lo usan las dos pestañas de Finanzas › Modelos › Comisiones: «Cómo funciona» (las calculadoras chicas) y
 * «Simulación» (una persona con sus ventas ganadas y su meta de HubSpot). Corre en el navegador: sin Prisma ni red.
 * El porqué de cada regla: docs/DECISIONS.md › «El modelo de comisiones cerrado con Marco».
 *
 * Las reglas, en una línea cada una:
 *  · Quien vende gana un porcentaje de TODO lo que vendió en el mes, según cuánto de su meta del mes cumplió: menos del
 *    50 %, 3 %; del 50 al 100 %, 4 %; desde el 100 %, 5 %.
 *  · Una venta vale lo único más 12 meses de lo mensual, para la meta y para la comisión. El descuento (contra la primera
 *    propuesta del trato) sale entero de la base de la comisión y no baja lo que cuenta para la meta.
 *  · Una licencia paga el 10 % de su valor mensual durante 3 meses, solo si la trajo Smarteam.
 *  · Ventas se queda con el cliente nuevo y con lo que se le venda en los 6 meses desde su primera venta. Después, la
 *    venta es de su dueño en HubSpot. Una venta compartida entre Ventas y Customer Success (marcada antes de la firma)
 *    paga la mitad a cada uno y cuenta completa en las dos metas.
 *  · Customer Success gana el 5 % fijo de lo que vende; una venta suya sin Ventas cuenta solo para su meta.
 *  · Quien lidera Ventas gana 1/60 de lo que vende cada persona que lidera (US$ 500 por cada US$ 30.000), mes por mes,
 *    si esa persona llegó al 70 % de su meta; deja de crecer en el 150 %. Se paga cada trimestre. Lo suyo no cuenta.
 *  · Quien lidera Customer Success gana el 2 % de la meta del área en cada trimestre, desde el 70 %, con tope del 150 %.
 *  · Una venta que se cae en sus primeros 90 días se resta del mes en que se firmó; la diferencia se descuenta de las
 *    próximas comisiones.
 *  · Una renovación no cuenta para ninguna meta: el CSE de la cuenta gana el 2 % de un año, si se renovó a tiempo y sin
 *    descuento. Un servicio mensual sin fin renueva cada 12 meses.
 *  · La meta es mensual. HubSpot la guarda por trimestre y la reparte entre los meses por días: así la mostramos.
 *
 * Es una SIMULACIÓN: dice lo que generaría cada venta. Nada de acá se paga ni se guarda.
 */

import { MESES_DEL_VALOR, UMBRAL_DE_APROBACION } from "@/lib/business-cases/descuento";

export { MESES_DEL_VALOR, UMBRAL_DE_APROBACION };

/** Desde cuándo rige: las comisiones y los bonos. Reemplaza todas las condiciones anteriores. */
export const RIGE_DESDE = { comisiones: "2026-11-01", bonos: "2027-01-01" } as const;

/** Los tramos de la comisión por venta: desde qué parte de la meta corre cada porcentaje. Iguales para todos. */
export const TRAMOS_DE_VENTA = [
  { desde: 0, porcentaje: 3, rotulo: "Menos del 50 %" },
  { desde: 0.5, porcentaje: 4, rotulo: "Del 50 al 100 %" },
  { desde: 1, porcentaje: 5, rotulo: "Desde el 100 %" },
] as const;

/** Lo que gana una licencia: el 10 % de su valor mensual, durante 3 meses. */
export const LICENCIA = { porcentaje: 10, meses: 3 } as const;

/** Los meses desde la primera venta de un cliente en que todo lo que se le vende es de Ventas. */
export const MESES_DE_VENTAS = 6;

/** Desde qué parte de la meta corre un bono, y dónde deja de crecer. El mismo para los dos bonos. */
export const MINIMO_DE_LOS_BONOS = 0.7;
export const TOPE_DE_LOS_BONOS = 1.5;

/**
 * El bono de quien lidera Ventas: US$ 500 por cada US$ 30.000 que vende cada persona que lidera (1/60, el 1,67 %), en
 * los meses en que esa persona llegó al 70 % de su meta. Lo vendido deja de crecer en el 150 % de su meta.
 */
export const BONO_DEL_LIDER = { paga: 500, porCada: 30000, minimo: MINIMO_DE_LOS_BONOS, tope: TOPE_DE_LOS_BONOS } as const;

/**
 * El bono de quien lidera Customer Success: el 2 % de la meta del área en cada trimestre, con el mismo mínimo y el mismo
 * tope que el de Ventas. NO es por persona: US$ 500 por cada uno de los 4 CSE habrían sido cerca del 18 % de lo que
 * expande el área.
 *
 * La meta sale de lo que la cartera compró en expansión los últimos 12 meses (oct 2025 a sep 2026), la vendiera quien la
 * vendiera (hasta ahora, casi todo Marco y Andrés), sin las renovaciones de contrato: renovar no es crecer. Es una foto
 * de ese día, no un cálculo vivo. Sube por escalones porque el área recién empieza a vender lo que antes vendía Ventas.
 */
export const BONO_DE_CUSTOMER_SUCCESS = {
  porcentajeDeLaMeta: 2,
  base: {
    periodo: "octubre de 2025 a septiembre de 2026",
    expansion: 134215,
    renovacionesFuera: 30920,
  },
  escalera: [
    { meta: 25000, porque: "Traspaso: Marco y Andrés le pasan las cuentas a Customer Success" },
    { meta: 33000, porque: "El ritmo de hoy" },
    { meta: 37000, porque: "El ritmo de hoy más un 10 %" },
    { meta: 40000, porque: "Crecimiento" },
  ],
} as const;

/** Lo que gana Customer Success por una venta suya: siempre el mismo porcentaje, sin meta propia. */
export const PORCENTAJE_DE_CUSTOMER_SUCCESS = 5;

/** El bono de una renovación para el CSE de la cuenta: el 2 % de un año del contrato renovado. */
export const RENOVACION = { porcentaje: 2, meses: MESES_DEL_VALOR } as const;

/** Los días desde la firma en que, si el cliente cancela, la venta se resta del mes en que se firmó. */
export const DIAS_PARA_CAERSE = 90;

/**
 * Los techos (solo Super Admin): lo que se paga a quienes atienden al cliente (quien vende, Customer Success y quien
 * lidera) hasta el 7 % de los servicios vendidos, y todo hasta el 10 %. Sin licencias. Se mide por trimestre.
 */
export const TECHOS = { quienesAtienden: 7, total: 10 } as const;

/** Lo que gana hoy quien vende: un porcentaje fijo, se llegue o no a la meta. Solo para comparar. */
export const PORCENTAJE_DE_HOY = 5;

const redondear = (x: number) => Math.round(x * 100) / 100;

/** El porcentaje que corresponde a un cumplimiento de la meta (0,83 = 83 %). */
export function porcentajeDelCumplimiento(cumplimiento: number): number {
  let p: number = TRAMOS_DE_VENTA[0].porcentaje;
  for (const t of TRAMOS_DE_VENTA) if (cumplimiento >= t.desde) p = t.porcentaje;
  return p;
}

/**
 * El bono de quien lidera por UNA persona en UN mes: 1/60 de lo que vendió si llegó al 70 % de su meta, con lo vendido
 * hasta el 150 % de esa meta. Meta 10.000 y vende 8.000 → 133,33; meta 30.000: 18.000 → 0, 30.000 → 500, 50.000 → 750.
 */
export function bonoDelLiderPorPersona(vendido: number, meta: number | null): number {
  if (!meta || meta <= 0 || vendido / meta < BONO_DEL_LIDER.minimo) return 0;
  return redondear((Math.min(vendido, meta * BONO_DEL_LIDER.tope) * BONO_DEL_LIDER.paga) / BONO_DEL_LIDER.porCada);
}

/** El bono de quien lidera Customer Success en un trimestre: el 2 % de la meta por el cumplimiento, desde el 70 % y hasta el 150 %. */
export function bonoDeCustomerSuccess(meta: number, vendido: number): number {
  if (meta <= 0 || vendido / meta < MINIMO_DE_LOS_BONOS) return 0;
  return redondear(((meta * BONO_DE_CUSTOMER_SUCCESS.porcentajeDeLaMeta) / 100) * Math.min(vendido / meta, TOPE_DE_LOS_BONOS));
}

/** Lo que gana quien lidera Customer Success si el área llega justo a esa meta. */
export function bonoDeCustomerSuccessAlCien(meta: number): number {
  return (meta * BONO_DE_CUSTOMER_SUCCESS.porcentajeDeLaMeta) / 100;
}

/** La meta del área de Customer Success del trimestre `n` (1–4) del esquema: los escalones, y el último se queda. */
export function metaDeCustomerSuccess(n: number): number {
  const e = BONO_DE_CUSTOMER_SUCCESS.escalera;
  return e[Math.min(Math.max(n, 1), e.length) - 1].meta;
}

/** Lo que gana una licencia en total (los 3 meses). */
export function comisionDeLicencia(valorMensual: number): number {
  return redondear((Math.max(0, valorMensual) * LICENCIA.porcentaje) / 100 * LICENCIA.meses);
}

/** El bono de una renovación: el 2 % de un año, solo si se renovó a tiempo y sin descuento. */
export function bonoDeRenovacion(valorDelAnio: number, aTiempo: boolean, descontado: number): number {
  if (!aTiempo || descontado > 0) return 0;
  return redondear((Math.max(0, valorDelAnio) * RENOVACION.porcentaje) / 100);
}

// ── El valor de la venta ─────────────────────────────────────────────────────────

/** Lo que tiene una venta: una parte única, una parte al mes y lo descontado en 12 meses. Todo en la moneda de la meta. */
export interface PartesDeLaVenta {
  unico: number;
  mensual: number;
  descontado: number;
}

export interface ValorDeLaVenta {
  /** Lo cerrado en 12 meses: único + 12 × mensual. Es también lo que cuenta para la meta. */
  valor: number;
  /** Lo que cuenta para la meta: lo cerrado. El descuento no lo baja. */
  paraLaMeta: number;
  /** Sobre lo que se calcula la comisión: lo cerrado menos lo descontado. */
  base: number;
  /** Lo descontado sobre lo que valía la primera propuesta, en por ciento. */
  porcentajeDeDescuento: number;
}

/**
 * El valor de una venta para la comisión. El caso de Marco: 2.800 al mes con 2.400 descontados al año valen 33.600,
 * cuentan 33.600 para la meta y comisionan sobre 31.200. `descuentoDentro` es el antes: el descuento no sale de la base.
 */
export function valorDeLaVenta(p: PartesDeLaVenta, descuentoDentro = false): ValorDeLaVenta {
  const unico = Math.max(0, p.unico);
  const mensual = Math.max(0, p.mensual);
  const descontado = Math.max(0, p.descontado);
  const valor = unico + MESES_DEL_VALOR * mensual;
  return {
    valor: redondear(valor),
    paraLaMeta: redondear(valor),
    base: redondear(descuentoDentro ? valor : Math.max(0, valor - descontado)),
    porcentajeDeDescuento: valor + descontado > 0 ? redondear((descontado / (valor + descontado)) * 100) : 0,
  };
}

/** La comisión de una venta con un porcentaje: sobre la base. */
export function comisionSobreLaBase(p: PartesDeLaVenta, porcentaje: number): number {
  return redondear((valorDeLaVenta(p).base * porcentaje) / 100);
}

// ── Las ventas ─────────────────────────────────────────────────────────────────

/** Qué es un negocio según HubSpot (`motion_comercial`): null si nadie lo marcó. */
export type TipoDeNegocio = "nuevo" | "expansion" | "renovacion";

/** Un negocio ganado, tal como lo necesita la simulación. Fechas en «YYYY-MM-DD» (hora de Costa Rica). */
export interface VentaParaSimular {
  id: string;
  fecha: string;
  nombre: string;
  /** La empresa en Nexus, o null si el trato no resuelve a ninguna. */
  cliente: string | null;
  monto: number | null;
  moneda: string;
  /** El trato viene del pipeline «HubSpot Shared Selling»: lo refirió HubSpot. */
  refiereHubspot: boolean;
  /** La primera venta ganada de ese cliente (de cualquier vendedor y de cualquier año), o null sin cliente. */
  primeraVenta: string | null;
  /** La propuesta del mismo trato de HubSpot, con lo que dice de sus servicios. Ausente sin propuesta legible. */
  propuesta?: PropuestaDeLaVenta | null;
  /** Lo que dice HubSpot que es el negocio. null o ausente: nadie lo marcó, y se deduce. */
  tipoDeNegocio?: TipoDeNegocio | null;
  /** Con quién se comparte, si se marcó antes de la firma. */
  compartidaCon?: { id: string | null; nombre: string } | null;
  /** La marca de compartida se puso o cambió después de la firma: no vale. */
  compartidaTarde?: boolean;
  /** El dueño del trato es de Customer Success (CSE o CSL). */
  deCustomerSuccess?: boolean;
  /** El trato dejó de estar ganado en HubSpot: perdido, reabierto o borrado, y cuándo lo vio Nexus. */
  caida?: { fecha: string; estado: "PERDIDA" | "REABIERTA" | "DESAPARECIDA" } | null;
  /** El CSE encargado de la cuenta (lib/cuentas/encargado.ts): a quien le toca el bono de una renovación. */
  encargado?: { id: string | null; nombre: string } | null;
}

/** Lo que dice de sus servicios la propuesta de una venta (lib/business-cases/descuento.ts), en la moneda de la venta. */
export interface PropuestaDeLaVenta {
  id: string;
  nombre: string;
  unico: number;
  mensual: number;
  /** Lo descontado en 12 meses contra la primera propuesta del trato. */
  descontado: number;
  /** Lo descontado sobre lo que valía la primera propuesta, en por ciento. */
  porcentaje: number;
  /** Alguna línea no se pudo leer: los números se quedan cortos. */
  incompleto: boolean;
  aprobacion: AprobacionDeLaVenta;
  /** Contra qué se midió el descuento. null: no hubo con qué comparar (sin servicios u otra moneda). */
  primera?: { nombre: string; version: number; esLaMisma: boolean } | null;
}

export type AprobacionDeLaVenta =
  | { estado: "no-hace-falta" }
  | { estado: "aprobado"; porNombre: string; en: string }
  | { estado: "falta" }
  /** El descuento lo escribió alguien en la simulación: no se sabe si se aprobó. */
  | { estado: "sin-saber" };

export type TipoDeVenta = "servicio" | "licencia" | "sinMonto" | "otraMoneda";

/**
 * Si el nombre del trato dice que es una licencia. HubSpot no lo marca en ningún campo: es una deducción, y la
 * pantalla deja corregirla venta por venta.
 */
export function pareceLicencia(nombre: string): boolean {
  return /licen|sillas|asientos|seats?\b|sales pro|marketing pro|service pro|\b[MSC]HP\b|data ?hub|^RCC\b/i.test(nombre);
}

/** Qué es una venta para la simulación. `corregido` es lo que eligió la persona en la pantalla. */
export function tipoDeVenta(v: VentaParaSimular, corregido?: "servicio" | "licencia", moneda = "USD"): TipoDeVenta {
  if (v.moneda !== moneda) return "otraMoneda";
  const esLicencia = corregido ? corregido === "licencia" : pareceLicencia(v.nombre);
  if (esLicencia) return "licencia";
  if (v.monto == null || v.monto === 0) return "sinMonto";
  return "servicio";
}

/** «2026-01-31» + 6 meses = «2026-07-31». El día no se ajusta: comparar strings sigue funcionando. */
export function sumarMeses(fecha: string, meses: number): string {
  let y = Number(fecha.slice(0, 4));
  let m = Number(fecha.slice(5, 7)) + meses;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}${fecha.slice(7)}`;
}

const DIA = 86_400_000;
const diaUTC = (fecha: string) => Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)));

/** Si una venta se cayó en sus primeros 90 días. `corregido` es lo que marcó la persona en la pantalla. */
export function seCayoATiempo(v: VentaParaSimular, corregido?: boolean): boolean {
  if (corregido != null) return corregido;
  if (!v.caida) return false;
  return (diaUTC(v.caida.fecha) - diaUTC(v.fecha)) / DIA <= DIAS_PARA_CAERSE;
}

export type ComoCuenta = "sinEmpresa" | "clienteNuevo" | "primerosMeses" | "expansion" | "renovacion";

export interface AQuienLeCuenta {
  como: ComoCuenta;
  /** La parte de la comisión: 1, o 0,5 si la venta se comparte entre Ventas y Customer Success. 0 en una renovación. */
  parte: number;
  /** Nadie marcó el tipo en HubSpot: Nexus lo dedujo de la primera venta del cliente. */
  deducido: boolean;
}

/**
 * Cómo cuenta una venta. Una renovación no cuenta para ninguna meta. Si HubSpot no dice el tipo, se deduce: la primera
 * venta del cliente es cliente nuevo, y en los 6 meses desde ella todo es de Ventas. La mitad si se compartió.
 */
export function aQuienLeCuenta(v: VentaParaSimular): AQuienLeCuenta {
  const parte = v.compartidaCon ? 0.5 : 1;
  const tipo = v.tipoDeNegocio ?? null;
  const deducido = tipo == null;
  if (tipo === "renovacion") return { como: "renovacion", parte: 0, deducido };
  if (!v.cliente || !v.primeraVenta) return { como: tipo === "expansion" ? "expansion" : "sinEmpresa", parte, deducido };
  if (tipo === "nuevo" || (tipo == null && v.primeraVenta === v.fecha)) return { como: "clienteNuevo", parte, deducido };
  if (v.fecha <= sumarMeses(v.primeraVenta, MESES_DE_VENTAS)) return { como: "primerosMeses", parte, deducido };
  return { como: "expansion", parte, deducido };
}

/** El valor mensual de una licencia si nadie lo escribió: el monto del trato como si fuera el año, o cero sin monto. */
export function valorMensualSugerido(v: VentaParaSimular): number {
  return v.monto ? Math.round(v.monto / 12) : 0;
}

// ── La meta ────────────────────────────────────────────────────────────────────

/** Un tramo de la meta de HubSpot: `hasta` es exclusivo («2026-04-01» cierra el primer trimestre). */
export interface TramoDeMeta {
  desde: string;
  hasta: string;
  monto: number;
  avance: number | null;
}

/**
 * La meta de un mes («2026-02»): la parte de cada tramo que cae en ese mes, repartida por DÍAS, como la muestra HubSpot en
 * su desglose mensual (70.000 del primer trimestre → enero 24.111,11 y febrero 21.777,78). null si ningún tramo lo cubre.
 */
export function metaDelMes(tramos: readonly TramoDeMeta[], mes: string): number | null {
  const ini = Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1);
  const fin = Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1);
  let total: number | null = null;
  for (const t of tramos) {
    const desde = diaUTC(t.desde);
    const hasta = diaUTC(t.hasta);
    const dias = (hasta - desde) / DIA;
    const enElMes = (Math.min(fin, hasta) - Math.max(ini, desde)) / DIA;
    if (dias > 0 && enElMes > 0) total = (total ?? 0) + (t.monto * enElMes) / dias;
  }
  return total;
}

// ── La simulación de una persona ───────────────────────────────────────────────

/** Lo que la persona corrigió de una venta en la pantalla. */
export interface AjusteDeVenta {
  tipo?: "servicio" | "licencia";
  valorMensual?: number;
  laTrajoSmarteam?: boolean;
  /** Si el servicio es recurrente. Tocarlo deja de leer las partes de la propuesta. */
  recurrente?: boolean;
  /** Lo que se cobra al mes, si es recurrente. Tocarlo deja de leer las partes de la propuesta. */
  mensual?: number;
  /** Lo descontado en 12 meses, escrito a mano. */
  descuento?: number;
  /** El cliente canceló en sus primeros 90 días (lo que Nexus no ve: un servicio que deja de pagarse). */
  seCayo?: boolean;
  /** Una renovación que se firmó a tiempo. Nexus no lo sabe: se supone que sí. */
  aTiempo?: boolean;
}

export type OrigenDeLasPartes = "propuesta" | "hubspot" | "escrito";
export type OrigenDelDescuento = "propuesta" | "escrito" | "ninguno";

export interface PartesResueltas extends PartesDeLaVenta {
  recurrente: boolean;
  origen: OrigenDeLasPartes;
  origenDelDescuento: OrigenDelDescuento;
  /** El valor al mes salió de suponer que el monto de HubSpot es el año. */
  mensualSupuesto: boolean;
}

/**
 * Las partes de una venta de servicios. Sin propuesta ni ajuste, toda la venta es única y vale su monto de HubSpot. Con
 * propuesta, sus servicios dicen qué es único y qué es al mes, y lo descontado contra la primera propuesta del trato.
 * Si alguien cambia el tipo o el valor al mes, se deja de leer la propuesta y se parte del monto de HubSpot.
 */
export function partesDeLaVenta(v: VentaParaSimular, a: AjusteDeVenta = {}): PartesResueltas {
  const p = v.propuesta ?? null;
  const monto = Math.max(0, v.monto ?? 0);
  const descuento =
    a.descuento != null
      ? { descontado: Math.max(0, a.descuento), origenDelDescuento: "escrito" as const }
      : p && p.descontado > 0
        ? { descontado: p.descontado, origenDelDescuento: "propuesta" as const }
        : { descontado: 0, origenDelDescuento: "ninguno" as const };
  if (p && a.recurrente == null && a.mensual == null) {
    return { unico: p.unico, mensual: p.mensual, recurrente: p.mensual > 0, origen: "propuesta", mensualSupuesto: false, ...descuento };
  }
  const recurrente = a.recurrente ?? a.mensual != null;
  if (!recurrente) {
    return { unico: monto, mensual: 0, recurrente: false, origen: a.recurrente == null ? "hubspot" : "escrito", mensualSupuesto: false, ...descuento };
  }
  const mensualSupuesto = a.mensual == null;
  const mensual = mensualSupuesto ? Math.round(monto / MESES_DEL_VALOR) : Math.max(0, a.mensual!);
  return { unico: 0, mensual, recurrente: true, origen: "escrito", mensualSupuesto, ...descuento };
}

/** Si el descuento de una venta está aprobado. Uno escrito a mano de más del umbral no se sabe. */
export function aprobacionDeLaVenta(v: VentaParaSimular, partes: PartesResueltas, porcentajeDeDescuento: number): AprobacionDeLaVenta {
  if (partes.origenDelDescuento === "propuesta" && v.propuesta) return v.propuesta.aprobacion;
  if (porcentajeDeDescuento <= UMBRAL_DE_APROBACION) return { estado: "no-hace-falta" };
  return { estado: "sin-saber" };
}

export interface PeriodoSimulado {
  /** «2026-02». */
  clave: string;
  /** El número del mes (1–12). */
  numero: number;
  enCurso: boolean;
  /** null en Customer Success: no tiene meta propia. */
  meta: number | null;
  /** Lo que cuenta para la meta: los servicios, sin renovaciones ni las ventas que se cayeron a tiempo. */
  vendido: number;
  cumplimiento: number | null;
  porcentaje: number;
  comision: number;
  /** Lo que se habría pagado de más por las ventas que se cayeron: se descuenta de las próximas comisiones. */
  aDescontar: number;
}

export interface ServicioSimulado {
  venta: VentaParaSimular;
  tipo: Exclude<TipoDeVenta, "licencia">;
  periodo: string;
  aQuien: AQuienLeCuenta | null;
  porcentaje: number | null;
  comision: number | null;
  /** Las partes de la venta y su valor: null si la venta no comisiona (sin monto u otra moneda). */
  partes: PartesResueltas | null;
  valor: ValorDeLaVenta | null;
  aprobacion: AprobacionDeLaVenta | null;
  /** Se cayó en sus primeros 90 días: no cuenta ni comisiona. */
  seCayo: boolean;
}

export interface LicenciaSimulada {
  venta: VentaParaSimular;
  periodo: string;
  valorMensual: number;
  valorEscrito: boolean;
  laTrajoSmarteam: boolean;
  /** Con la mitad si la venta se compartió. */
  comision: number;
}

export interface SimulacionDeVendedor {
  periodos: PeriodoSimulado[];
  servicios: ServicioSimulado[];
  licencias: LicenciaSimulada[];
  totalPorVentas: number;
  totalPorLicencias: number;
  /** Lo que se descuenta de las próximas comisiones por las ventas que se cayeron. */
  totalADescontar: number;
  /** Lo cerrado en servicios en el año (la moneda de la meta), con lo recurrente a 12 meses, sin renovaciones. */
  vendidoEnServicios: number;
  /** Lo descontado en servicios en el año, a 12 meses. */
  descontadoEnServicios: number;
  /** Las mismas ventas de servicios con el 5 % fijo de hoy. */
  conElPorcentajeDeHoy: number;
}

export type AreaDeLaPersona = "ventas" | "customerSuccess";

export interface EntradaDeSimulacion {
  anio: number;
  /** El mes de hoy (1–12): los meses posteriores no se muestran; el de hoy va «en curso». */
  mesActual: number;
  ventas: readonly VentaParaSimular[];
  /** La meta de HubSpot. Customer Success no tiene meta propia: lista vacía. */
  tramos: readonly TramoDeMeta[];
  /** Ventas: el porcentaje sale del cumplimiento. Customer Success: el 5 % fijo. */
  area?: AreaDeLaPersona;
  ajustes?: Readonly<Record<string, AjusteDeVenta>>;
  moneda?: string;
  /** El antes, para comparar: el descuento no sale de la base. */
  descuentoDentro?: boolean;
}

/** Lo que generaría cada venta de una persona en el año, mes a mes. */
export function simularVendedor(e: EntradaDeSimulacion): SimulacionDeVendedor {
  const { anio, mesActual } = e;
  const moneda = e.moneda ?? "USD";
  const ajustes = e.ajustes ?? {};
  const esCs = e.area === "customerSuccess";

  const delAnio = e.ventas.filter((v) => v.fecha.startsWith(`${anio}-`) && Number(v.fecha.slice(5, 7)) <= mesActual);
  const clasificadas = delAnio.map((v) => {
    const tipo = tipoDeVenta(v, ajustes[v.id]?.tipo, moneda);
    const partes = tipo === "servicio" ? partesDeLaVenta(v, ajustes[v.id]) : null;
    const valor = partes ? valorDeLaVenta(partes, e.descuentoDentro) : null;
    const aQuien = aQuienLeCuenta(v);
    // Una venta cuenta completa en el mes en que se firma: una venta única no se reparte entre los meses que se cobra.
    return { v, tipo, periodo: v.fecha.slice(0, 7), partes, valor, aQuien, seCayo: seCayoATiempo(v, ajustes[v.id]?.seCayo) };
  });
  const cuenta = (c: (typeof clasificadas)[number], conLasCaidas: boolean) =>
    c.valor != null && c.aQuien.como !== "renovacion" && (conLasCaidas || !c.seCayo);

  const licencias: LicenciaSimulada[] = clasificadas
    .filter((c) => c.tipo === "licencia" && !c.seCayo)
    .map(({ v, periodo }) => {
      const a = ajustes[v.id] ?? {};
      const valorEscrito = a.valorMensual != null;
      const valorMensual = valorEscrito ? Math.max(0, a.valorMensual!) : valorMensualSugerido(v);
      const laTrajoSmarteam = a.laTrajoSmarteam ?? !v.refiereHubspot;
      const parte = v.compartidaCon ? 0.5 : 1;
      return { venta: v, periodo, valorMensual, valorEscrito, laTrajoSmarteam, comision: laTrajoSmarteam ? redondear(comisionDeLicencia(valorMensual) * parte) : 0 };
    });

  // Cada mes, dos veces: como es (sin las ventas que se cayeron) y como se habría pagado con ellas.
  const mesDe = (i: number) => `${anio}-${String(i + 1).padStart(2, "0")}`;
  const porcentajeDe = (meta: number | null, vendido: number) => {
    if (esCs) return PORCENTAJE_DE_CUSTOMER_SUCCESS;
    return porcentajeDelCumplimiento(meta && meta > 0 ? vendido / meta : 0);
  };
  const comisionDelMes = (clave: string, porcentaje: number, conLasCaidas: boolean) =>
    clasificadas.filter((c) => c.periodo === clave && cuenta(c, conLasCaidas)).reduce((a, c) => a + ((c.valor!.base * porcentaje) / 100) * c.aQuien.parte, 0);

  const periodos: PeriodoSimulado[] = Array.from({ length: mesActual }, (_, i) => {
    const clave = mesDe(i);
    const meta = esCs ? null : metaDelMes(e.tramos, clave);
    // La meta es solo de servicios: las licencias no suman. La venta compartida cuenta completa.
    let vendido = 0;
    let vendidoConLasCaidas = 0;
    for (const c of clasificadas) {
      if (c.periodo !== clave) continue;
      if (cuenta(c, false)) vendido += c.valor!.paraLaMeta;
      if (cuenta(c, true)) vendidoConLasCaidas += c.valor!.paraLaMeta;
    }
    const porcentaje = porcentajeDe(meta, vendido);
    const comision = redondear(comisionDelMes(clave, porcentaje, false));
    const comisionConLasCaidas = redondear(comisionDelMes(clave, porcentajeDe(meta, vendidoConLasCaidas), true));
    return {
      clave,
      numero: i + 1,
      enCurso: i + 1 === mesActual,
      meta: meta == null ? null : redondear(meta),
      vendido: redondear(vendido),
      cumplimiento: meta && meta > 0 ? vendido / meta : null,
      porcentaje,
      comision,
      aDescontar: redondear(Math.max(0, comisionConLasCaidas - comision)),
    };
  });
  const porClave = new Map(periodos.map((p) => [p.clave, p]));

  const servicios: ServicioSimulado[] = clasificadas
    .filter((c) => c.tipo !== "licencia")
    .map(({ v, tipo, periodo, partes, valor, aQuien, seCayo }) => {
      if (tipo !== "servicio" || !partes || !valor) {
        return { venta: v, tipo: tipo as ServicioSimulado["tipo"], periodo, aQuien: null, porcentaje: null, comision: null, partes: null, valor: null, aprobacion: null, seCayo };
      }
      const p = porClave.get(periodo)!;
      const comisiona = aQuien.como !== "renovacion" && !seCayo;
      const comision = comisiona ? redondear(((valor.base * p.porcentaje) / 100) * aQuien.parte) : null;
      const aprobacion = aprobacionDeLaVenta(v, partes, valor.porcentajeDeDescuento);
      return { venta: v, tipo: "servicio", periodo, aQuien, porcentaje: comisiona ? p.porcentaje : null, comision, partes, valor, aprobacion, seCayo };
    });

  const cuentan = servicios.filter((s) => s.valor && s.aQuien?.como !== "renovacion" && !s.seCayo);
  const vendidoEnServicios = cuentan.reduce((a, s) => a + s.valor!.valor, 0);
  const descontadoEnServicios = cuentan.reduce((a, s) => a + (s.partes?.descontado ?? 0), 0);
  return {
    periodos,
    servicios,
    licencias,
    totalPorVentas: redondear(periodos.reduce((a, p) => a + p.comision, 0)),
    totalPorLicencias: redondear(licencias.reduce((a, l) => a + l.comision, 0)),
    totalADescontar: redondear(periodos.reduce((a, p) => a + p.aDescontar, 0)),
    vendidoEnServicios: redondear(vendidoEnServicios),
    descontadoEnServicios: redondear(descontadoEnServicios),
    conElPorcentajeDeHoy: redondear((vendidoEnServicios * PORCENTAJE_DE_HOY) / 100),
  };
}

const trimestreDe = (mes: number) => Math.floor((mes - 1) / 3) + 1;

// ── El bono de quien lidera Ventas ─────────────────────────────────────────────

/** Una persona que lidera quien gana el bono: su nombre y sus meses, de su propia simulación. */
export interface PersonaLiderada {
  nombre: string;
  periodos: readonly PeriodoSimulado[];
}

export interface TrimestreDelBono {
  numero: number;
  enCurso: boolean;
  /** Cuántas personas lideradas tienen meta en el trimestre. */
  personas: number;
  /** La suma de sus metas. */
  meta: number;
  /** Lo que vendieron: lo mismo que mide su comisión. */
  vendido: number;
  /** El bono del trimestre, mes por mes y persona por persona. Se paga al cerrar el trimestre. */
  bono: number;
  /** Los meses que no llegaron al 70 % de la meta de esa persona. */
  mesesBajoElMinimo: number;
  /** Los meses en que lo vendido pasó el 150 % y dejó de crecer. */
  mesesConTope: number;
}

/**
 * El bono de quien lidera Ventas, trimestre a trimestre, con lo que vendieron las personas que lidera: SUS propias
 * ventas no cuentan. Cada mes de cada persona se mide contra su propia meta de ese mes.
 */
export function bonoDelLider(mesActual: number, lideradas: readonly PersonaLiderada[]): TrimestreDelBono[] {
  const hoy = trimestreDe(mesActual);
  return Array.from({ length: hoy }, (_, i) => {
    const numero = i + 1;
    let meta = 0;
    let vendido = 0;
    let bono = 0;
    let mesesBajoElMinimo = 0;
    let mesesConTope = 0;
    const conMeta = new Set<string>();
    for (const l of lideradas) {
      for (const p of l.periodos) {
        if (trimestreDe(p.numero) !== numero || !p.meta || p.meta <= 0) continue;
        conMeta.add(l.nombre);
        meta += p.meta;
        vendido += p.vendido;
        bono += bonoDelLiderPorPersona(p.vendido, p.meta);
        if (p.vendido / p.meta < BONO_DEL_LIDER.minimo) mesesBajoElMinimo++;
        else if (p.vendido / p.meta > BONO_DEL_LIDER.tope) mesesConTope++;
      }
    }
    return {
      numero,
      enCurso: numero === hoy,
      personas: conMeta.size,
      meta: redondear(meta),
      vendido: redondear(vendido),
      bono: redondear(bono),
      mesesBajoElMinimo,
      mesesConTope,
    };
  });
}

// ── El área de Customer Success ────────────────────────────────────────────────

export interface TrimestreDeCustomerSuccess {
  numero: number;
  enCurso: boolean;
  /** El escalón de la meta del área para ese trimestre del esquema. */
  meta: number;
  /** Lo que creció la cartera: expansiones de Customer Success y compartidas, sin renovaciones ni lo que se cayó. */
  vendido: number;
  bono: number;
}

/**
 * El bono de quien lidera Customer Success, trimestre a trimestre: los meses de la simulación del área (todas sus ventas,
 * cada una una sola vez) contra el escalón de la meta. El escalón 1 va con el primer trimestre del año simulado.
 */
export function bonoDelAreaDeCustomerSuccess(mesActual: number, periodosDelArea: readonly PeriodoSimulado[]): TrimestreDeCustomerSuccess[] {
  const hoy = trimestreDe(mesActual);
  return Array.from({ length: hoy }, (_, i) => {
    const numero = i + 1;
    const meta = metaDeCustomerSuccess(numero);
    const vendido = periodosDelArea.filter((p) => trimestreDe(p.numero) === numero).reduce((a, p) => a + p.vendido, 0);
    return { numero, enCurso: numero === hoy, meta, vendido: redondear(vendido), bono: bonoDeCustomerSuccess(meta, vendido) };
  });
}

// ── Las renovaciones ───────────────────────────────────────────────────────────

/** Un servicio mensual sin fecha de fin (Cobranza): renueva en cada aniversario de su primer cobro. */
export interface ServicioMensualSinFin {
  id: string;
  cliente: string;
  nombre: string;
  /** «YYYY-MM-DD»: desde cuándo se factura. */
  inicio: string;
  mensual: number;
  moneda: string;
  encargado: { id: string | null; nombre: string } | null;
}

export interface RenovacionSimulada {
  id: string;
  fecha: string;
  nombre: string;
  cliente: string | null;
  origen: "trato" | "mensual";
  encargado: { id: string | null; nombre: string } | null;
  /** Un año del contrato renovado. */
  valorDelAnio: number;
  descontado: number;
  aTiempo: boolean;
  /** «A tiempo» lo escribió la persona; si no, se supone. */
  aTiempoEscrito: boolean;
  bono: number;
}

/**
 * Las renovaciones del año con el bono del CSE de la cuenta: los tratos marcados renovación en HubSpot y los aniversarios
 * de los servicios mensuales sin fin. Solo los meses hasta hoy; una venta en otra moneda no se suma.
 */
export function renovacionesDelAnio(e: {
  anio: number;
  mesActual: number;
  tratos: readonly VentaParaSimular[];
  mensuales: readonly ServicioMensualSinFin[];
  ajustes?: Readonly<Record<string, AjusteDeVenta>>;
  moneda?: string;
}): RenovacionSimulada[] {
  const moneda = e.moneda ?? "USD";
  const ajustes = e.ajustes ?? {};
  const enElAnio = (fecha: string) => fecha.startsWith(`${e.anio}-`) && Number(fecha.slice(5, 7)) <= e.mesActual;
  const filas: RenovacionSimulada[] = [];
  for (const v of e.tratos) {
    if (v.tipoDeNegocio !== "renovacion" || !enElAnio(v.fecha) || v.moneda !== moneda || !v.monto) continue;
    const a = ajustes[v.id] ?? {};
    const partes = partesDeLaVenta(v, a);
    const valor = valorDeLaVenta(partes).valor;
    const aTiempo = a.aTiempo ?? true;
    filas.push({
      id: v.id,
      fecha: v.fecha,
      nombre: v.nombre,
      cliente: v.cliente,
      origen: "trato",
      encargado: v.encargado ?? null,
      valorDelAnio: valor,
      descontado: partes.descontado,
      aTiempo,
      aTiempoEscrito: a.aTiempo != null,
      bono: bonoDeRenovacion(valor, aTiempo, partes.descontado),
    });
  }
  for (const s of e.mensuales) {
    if (s.moneda !== moneda || s.mensual <= 0) continue;
    for (let k = 1; ; k++) {
      const fecha = sumarMeses(s.inicio, MESES_DEL_VALOR * k);
      if (fecha.slice(0, 4) > String(e.anio)) break;
      if (!enElAnio(fecha)) continue;
      const id = `${s.id}:${k}`;
      const a = ajustes[id] ?? {};
      const valor = redondear(s.mensual * MESES_DEL_VALOR);
      const aTiempo = a.aTiempo ?? true;
      filas.push({
        id,
        fecha,
        nombre: `${s.nombre} · año ${k + 1}`,
        cliente: s.cliente,
        origen: "mensual",
        encargado: s.encargado,
        valorDelAnio: valor,
        descontado: 0,
        aTiempo,
        aTiempoEscrito: a.aTiempo != null,
        bono: bonoDeRenovacion(valor, aTiempo, 0),
      });
    }
  }
  return filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ── Los techos ─────────────────────────────────────────────────────────────────

export interface TechoDelTrimestre {
  numero: number;
  enCurso: boolean;
  /** Los servicios vendidos en el trimestre, sin licencias. */
  vendido: number;
  /** Lo que se paga a quienes atienden al cliente: comisiones de servicios, bonos y renovaciones. */
  pagado: number;
  /** pagado / vendido, en por ciento; null sin ventas. */
  porcentaje: number | null;
  pasaQuienesAtienden: boolean;
  pasaElTotal: boolean;
}

/** El techo de un trimestre. Hoy nadie fuera de quienes atienden al cliente cobra comisión: el total es lo mismo. */
export function techoDelTrimestre(numero: number, enCurso: boolean, vendido: number, pagado: number): TechoDelTrimestre {
  const porcentaje = vendido > 0 ? redondear((pagado / vendido) * 100) : null;
  return {
    numero,
    enCurso,
    vendido: redondear(vendido),
    pagado: redondear(pagado),
    porcentaje,
    pasaQuienesAtienden: porcentaje != null && porcentaje > TECHOS.quienesAtienden,
    pasaElTotal: porcentaje != null && porcentaje > TECHOS.total,
  };
}
