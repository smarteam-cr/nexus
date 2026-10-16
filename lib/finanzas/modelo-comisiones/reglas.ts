/**
 * lib/finanzas/modelo-comisiones/reglas.ts — la propuesta de comisiones del 15 oct de 2026, como cálculo. PURO.
 *
 * Lo usan las dos pestañas de Finanzas › Modelos › Comisiones: «Cómo funciona» (las calculadoras chicas) y
 * «Simulación» (un vendedor con sus ventas ganadas y su meta de HubSpot). Corre en el navegador: sin Prisma ni red.
 *
 * Las reglas de la propuesta, en una línea cada una:
 *  · Quien vende gana un porcentaje de TODO lo que vendió en el mes, y el porcentaje sale de cuánto de su meta del mes
 *    cumplió: menos del 50 %, 3 %; del 50 al 100 %, 4 %; desde el 100 %, 5 %.
 *  · Una licencia paga el 10 % de su valor mensual durante 3 meses, solo si la trajo Smarteam.
 *  · Ventas se queda con el cliente nuevo y con todo lo que se le venda en los 6 meses desde su primera venta. Después,
 *    la expansión es de quien crea el negocio en HubSpot; si Ventas y Customer Success la hacen juntos, 50 · 50.
 *  · Quien lidera Ventas gana US$ 500 al mes por cada vendedor que llega a su meta, en proporción a lo que cumplió,
 *    desde el 70 % y con tope (200 %, o 150 % si así se decide). Sus propias ventas le dan comisión, no bono. Se paga
 *    cada trimestre. (Reunión de Elías y Marco del 2026-10-15.)
 *  · Quien lidera Customer Success gana el 2 % de la meta de expansión del área en cada trimestre, con una meta que
 *    sube por escalones. Los CSE no tienen meta propia: la meta es una sola, del área.
 *  · La meta es mensual. HubSpot la guarda por trimestre y la reparte entre los meses por días: así la mostramos.
 *
 * Es una SIMULACIÓN: dice lo que generaría cada venta. Nada de acá se paga ni se guarda.
 */

/** Los tramos de la comisión por venta: desde qué parte de la meta corre cada porcentaje. */
export const TRAMOS_DE_VENTA = [
  { desde: 0, porcentaje: 3, rotulo: "Menos del 50 %" },
  { desde: 0.5, porcentaje: 4, rotulo: "Del 50 al 100 %" },
  { desde: 1, porcentaje: 5, rotulo: "Desde el 100 %" },
] as const;

/** Lo que gana una licencia: el 10 % de su valor mensual, durante 3 meses. */
export const LICENCIA = { porcentaje: 10, meses: 3 } as const;

/** Los meses desde la primera venta de un cliente en que todo lo que se le vende es de Ventas. */
export const MESES_DE_VENTAS = 6;

/**
 * El bono de quien lidera (reunión del 2026-10-15): US$ 500 al mes por cada persona que lidera y llega a su meta, en
 * proporción a lo que cumplió. Desde el 70 % de cumplimiento; deja de crecer en el tope (200 %, o 150 %: pendiente).
 */
export const BONO_DEL_LIDER = { porPersonaAlMes: 500, minimo: 0.7, tope: 2, topeAlternativo: 1.5 } as const;

/**
 * El bono de quien lidera Customer Success (propuesta del 2026-10-15, escalonada el mismo día): el 2 % de la meta del
 * área en cada trimestre, con el mismo mínimo y el mismo tope que el de Ventas. NO es por persona: US$ 500 por cada uno
 * de los 4 CSE habrían sido cerca del 18 % de lo que expande el área.
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

/** Lo que gana quien lidera Customer Success si el área llega justo a esa meta. */
export function bonoDeCustomerSuccessAlCien(meta: number): number {
  return (meta * BONO_DE_CUSTOMER_SUCCESS.porcentajeDeLaMeta) / 100;
}

/** Solo para comparar en la simulación: lo que pagaría un 2 % de cada venta del equipo, la idea que el bono reemplaza. */
export const PARTE_DE_CADA_VENTA_PARA_COMPARAR = 0.02;

/** Lo que gana Customer Success por una expansión que le toca (a validar con Marco). */
export const PORCENTAJE_DE_CUSTOMER_SUCCESS = 5;

/** Lo que gana hoy quien vende: un porcentaje fijo, se llegue o no a la meta. Solo para comparar. */
export const PORCENTAJE_DE_HOY = 5;

/** El porcentaje que corresponde a un cumplimiento de la meta (0,83 = 83 %). */
export function porcentajeDelCumplimiento(cumplimiento: number): number {
  let p: number = TRAMOS_DE_VENTA[0].porcentaje;
  for (const t of TRAMOS_DE_VENTA) if (cumplimiento >= t.desde) p = t.porcentaje;
  return p;
}

/** El bono de un trimestre: `base` es el bono si el equipo llega justo a la meta. Bajo el mínimo, cero; arriba del tope, el tope. */
export function bonoTrimestral(base: number, cumplimiento: number, tope: number = BONO_DEL_LIDER.tope): number {
  if (cumplimiento < BONO_DEL_LIDER.minimo) return 0;
  return base * Math.min(cumplimiento, tope);
}

/** El bono completo de un trimestre (todos en su meta) con `personas` lideradas. */
export function baseDelBono(personas: number): number {
  return BONO_DEL_LIDER.porPersonaAlMes * 3 * personas;
}

/** Lo que gana una licencia en total (los 3 meses). */
export function comisionDeLicencia(valorMensual: number): number {
  return redondear((Math.max(0, valorMensual) * LICENCIA.porcentaje) / 100 * LICENCIA.meses);
}

const redondear = (x: number) => Math.round(x * 100) / 100;

// ── Las ventas ─────────────────────────────────────────────────────────────────

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
}

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

export type ComoCuenta = "sinEmpresa" | "clienteNuevo" | "primerosMeses" | "expansion";

export interface AQuienLeCuenta {
  como: ComoCuenta;
  /** La parte de la comisión que se lleva quien vendió: 1, o 0,5 si la expansión se reparte con Customer Success. */
  parte: number;
}

export type ExpansionDeVentas = "completa" | "mitad";

/**
 * A quién le cuenta una venta de quien vende. Dentro de los 6 meses desde la primera venta del cliente, a Ventas.
 * Después es una expansión, y se supone que la inició quien es dueño del trato en HubSpot.
 */
export function aQuienLeCuenta(v: VentaParaSimular, expansion: ExpansionDeVentas): AQuienLeCuenta {
  if (!v.cliente || !v.primeraVenta) return { como: "sinEmpresa", parte: 1 };
  if (v.primeraVenta === v.fecha) return { como: "clienteNuevo", parte: 1 };
  if (v.fecha <= sumarMeses(v.primeraVenta, MESES_DE_VENTAS)) return { como: "primerosMeses", parte: 1 };
  return { como: "expansion", parte: expansion === "mitad" ? 0.5 : 1 };
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

const DIA = 86_400_000;
const diaUTC = (fecha: string) => Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)));

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

// ── La simulación de un vendedor ───────────────────────────────────────────────

export type MedidaDelCumplimiento = "mes" | "trimestre";

/** Las decisiones pendientes que mueven el cálculo. */
export interface Decisiones {
  expansion: ExpansionDeVentas;
  medida: MedidaDelCumplimiento;
}

export const DECISIONES_DE_LA_PROPUESTA: Decisiones = {
  expansion: "completa",
  medida: "mes",
};

/** Lo que la persona corrigió de una venta en la pantalla. */
export interface AjusteDeVenta {
  tipo?: "servicio" | "licencia";
  valorMensual?: number;
  laTrajoSmarteam?: boolean;
}

export interface PeriodoSimulado {
  /** «2026-02» o «2026-T1». */
  clave: string;
  /** El número del mes (1–12) o del trimestre (1–4). */
  numero: number;
  enCurso: boolean;
  meta: number | null;
  /** Lo que cuenta para la meta: solo los servicios. */
  vendido: number;
  cumplimiento: number | null;
  porcentaje: number;
  comision: number;
}

export interface ServicioSimulado {
  venta: VentaParaSimular;
  tipo: Exclude<TipoDeVenta, "licencia">;
  periodo: string;
  aQuien: AQuienLeCuenta | null;
  porcentaje: number | null;
  comision: number | null;
}

export interface LicenciaSimulada {
  venta: VentaParaSimular;
  periodo: string;
  valorMensual: number;
  valorEscrito: boolean;
  laTrajoSmarteam: boolean;
  comision: number;
}

export interface SimulacionDeVendedor {
  periodos: PeriodoSimulado[];
  servicios: ServicioSimulado[];
  licencias: LicenciaSimulada[];
  totalPorVentas: number;
  totalPorLicencias: number;
  /** Lo vendido en servicios en el año (la moneda de la meta). */
  vendidoEnServicios: number;
  /** Las mismas ventas de servicios con el 5 % fijo de hoy. */
  conElPorcentajeDeHoy: number;
}

export interface EntradaDeSimulacion {
  anio: number;
  /** El mes de hoy (1–12): los meses posteriores no se muestran; el de hoy va «en curso». */
  mesActual: number;
  ventas: readonly VentaParaSimular[];
  tramos: readonly TramoDeMeta[];
  decisiones: Decisiones;
  ajustes?: Readonly<Record<string, AjusteDeVenta>>;
  moneda?: string;
}

const trimestreDe = (mes: number) => Math.floor((mes - 1) / 3) + 1;

/** Lo que generaría cada venta de un vendedor en el año, mes a mes (o trimestre a trimestre). */
export function simularVendedor(e: EntradaDeSimulacion): SimulacionDeVendedor {
  const { anio, mesActual, decisiones: d } = e;
  const moneda = e.moneda ?? "USD";
  const ajustes = e.ajustes ?? {};
  const porTrimestre = d.medida === "trimestre";
  const periodoDe = (fecha: string) => {
    const mes = Number(fecha.slice(5, 7));
    return porTrimestre ? `${anio}-T${trimestreDe(mes)}` : fecha.slice(0, 7);
  };

  const delAnio = e.ventas.filter((v) => v.fecha.startsWith(`${anio}-`) && Number(v.fecha.slice(5, 7)) <= mesActual);
  const clasificadas = delAnio.map((v) => ({ v, tipo: tipoDeVenta(v, ajustes[v.id]?.tipo, moneda), periodo: periodoDe(v.fecha) }));

  const licencias: LicenciaSimulada[] = clasificadas
    .filter((c) => c.tipo === "licencia")
    .map(({ v, periodo }) => {
      const a = ajustes[v.id] ?? {};
      const valorEscrito = a.valorMensual != null;
      const valorMensual = valorEscrito ? Math.max(0, a.valorMensual!) : valorMensualSugerido(v);
      const laTrajoSmarteam = a.laTrajoSmarteam ?? !v.refiereHubspot;
      return { venta: v, periodo, valorMensual, valorEscrito, laTrajoSmarteam, comision: laTrajoSmarteam ? comisionDeLicencia(valorMensual) : 0 };
    });

  // Los períodos y su meta.
  const claves: { clave: string; numero: number; meses: number[] }[] = porTrimestre
    ? Array.from({ length: trimestreDe(mesActual) }, (_, i) => ({ clave: `${anio}-T${i + 1}`, numero: i + 1, meses: [1, 2, 3].map((k) => i * 3 + k).filter((m) => m <= 12) }))
    : Array.from({ length: mesActual }, (_, i) => ({ clave: `${anio}-${String(i + 1).padStart(2, "0")}`, numero: i + 1, meses: [i + 1] }));

  const periodos: PeriodoSimulado[] = claves.map(({ clave, numero, meses }) => {
    let meta: number | null = null;
    for (const m of meses) {
      const mm = metaDelMes(e.tramos, `${anio}-${String(m).padStart(2, "0")}`);
      if (mm != null) meta = (meta ?? 0) + mm;
    }
    // La meta es solo de servicios: las licencias no suman (decidido el 2026-10-15).
    let vendido = 0;
    for (const c of clasificadas) if (c.periodo === clave && c.tipo === "servicio") vendido += c.v.monto!;
    const cumplimiento = meta && meta > 0 ? vendido / meta : null;
    const enCurso = porTrimestre ? numero === trimestreDe(mesActual) : numero === mesActual;
    return { clave, numero, enCurso, meta: meta == null ? null : redondear(meta), vendido: redondear(vendido), cumplimiento, porcentaje: porcentajeDelCumplimiento(cumplimiento ?? 0), comision: 0 };
  });
  const porClave = new Map(periodos.map((p) => [p.clave, p]));

  const servicios: ServicioSimulado[] = clasificadas
    .filter((c) => c.tipo !== "licencia")
    .map(({ v, tipo, periodo }) => {
      if (tipo !== "servicio") return { venta: v, tipo: tipo as ServicioSimulado["tipo"], periodo, aQuien: null, porcentaje: null, comision: null };
      const p = porClave.get(periodo)!;
      const aQuien = aQuienLeCuenta(v, d.expansion);
      const comision = redondear(((v.monto! * p.porcentaje) / 100) * aQuien.parte);
      p.comision = redondear(p.comision + comision);
      return { venta: v, tipo: "servicio", periodo, aQuien, porcentaje: p.porcentaje, comision };
    });

  const vendidoEnServicios = servicios.reduce((a, s) => a + (s.tipo === "servicio" ? s.venta.monto! : 0), 0);
  return {
    periodos,
    servicios,
    licencias,
    totalPorVentas: redondear(periodos.reduce((a, p) => a + p.comision, 0)),
    totalPorLicencias: redondear(licencias.reduce((a, l) => a + l.comision, 0)),
    vendidoEnServicios: redondear(vendidoEnServicios),
    conElPorcentajeDeHoy: redondear((vendidoEnServicios * PORCENTAJE_DE_HOY) / 100),
  };
}

// ── El bono de quien lidera ────────────────────────────────────────────────────

export interface TrimestreDelBono {
  numero: number;
  enCurso: boolean;
  /** Cuántas personas lideradas tienen meta en el trimestre. */
  personas: number;
  /** La suma de sus metas. */
  meta: number;
  /** Lo que vendieron según el avance de sus metas en HubSpot; null si HubSpot no trae avance. */
  vendido: number | null;
  cumplimiento: number | null;
  /** El bono si todas llegan justo a su meta: US$ 500 al mes por persona. */
  base: number;
  /** null mientras el trimestre está en curso. */
  bono: number | null;
  conElDosPorCiento: number | null;
}

/**
 * El bono trimestral de quien lidera, con las metas de las personas que lidera: SUS propias ventas no cuentan. Lo vendido
 * es el avance de cada tramo de HubSpot en el trimestre en que empieza. Solo los trimestres hasta el de hoy; el de hoy
 * no paga todavía.
 */
export function bonoDelLider(anio: number, mesActual: number, lideradas: readonly (readonly TramoDeMeta[])[], tope: number = BONO_DEL_LIDER.tope): TrimestreDelBono[] {
  const hoy = trimestreDe(mesActual);
  return Array.from({ length: hoy }, (_, i) => {
    const numero = i + 1;
    let meta = 0;
    let personas = 0;
    let vendido: number | null = null;
    for (const tramos of lideradas) {
      let suya = 0;
      for (let k = 1; k <= 3; k++) suya += metaDelMes(tramos, `${anio}-${String(i * 3 + k).padStart(2, "0")}`) ?? 0;
      if (suya > 0) personas++;
      meta += suya;
      for (const t of tramos) {
        if (!t.desde.startsWith(`${anio}-`) || t.avance == null) continue;
        if (trimestreDe(Number(t.desde.slice(5, 7))) === numero) vendido = (vendido ?? 0) + t.avance;
      }
    }
    const cumplimiento = vendido != null && meta > 0 ? vendido / meta : null;
    const base = baseDelBono(personas);
    const enCurso = numero === hoy;
    return {
      numero,
      enCurso,
      personas,
      meta: redondear(meta),
      vendido: vendido == null ? null : redondear(vendido),
      cumplimiento,
      base,
      bono: enCurso ? null : redondear(bonoTrimestral(base, cumplimiento ?? 0, tope)),
      conElDosPorCiento: enCurso || vendido == null ? null : redondear(vendido * PARTE_DE_CADA_VENTA_PARA_COMPARAR),
    };
  });
}
