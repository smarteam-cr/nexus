/**
 * lib/finanzas/equilibrio.ts
 *
 * El reporte anual de equilibrio, PURO: cero Prisma, cero red, cero `new Date()`.
 * Entra data del año (egresos mes a mes, ingresos mes a mes, tipos de cambio) y sale
 * el reporte entero. Vive acá y no en `lib/cobranza/engine.ts` por la misma razón que
 * `aguinaldo.ts`: el motor está congelado por fixtures golden y esto es otra pregunta.
 *
 * ── LA PREGUNTA QUE CONTESTA ─────────────────────────────────────────────────
 * "¿Cuánto hay que facturar cada mes para que la operación no pierda plata?" El método
 * lo eligió Elías y NO es la fórmula de contabilidad (costos fijos ÷ margen de
 * contribución), porque esa pide un costo variable por unidad que un negocio de
 * servicios no tiene: se promedian los GASTOS MENSUALES TOTALES de los meses
 * confiables. Es más tosco y es honesto sobre lo que mide.
 *
 * ── LAS CUATRO REGLAS QUE ESTE ARCHIVO SOSTIENE ──────────────────────────────
 *
 *  1. **Acá y en ningún otro lado se convierte moneda.** `convertir()` es la ÚNICA
 *     función del sistema autorizada a mezclar CRC y USD, y solo porque este reporte
 *     es una capa de PRESENTACIÓN. La base guarda en moneda nativa y los motores
 *     (engine, tarjetas, comisiones, partners, planilla, aguinaldo) siguen sin
 *     convertir jamás — hay un test estructural que lo verifica. Ver DECISIONS §El
 *     reporte anual de equilibrio.
 *  2. **Sin tasa NO se aproxima.** Un monto que no se pudo convertir no entra al total
 *     y sale listado en `fx.montosNoConvertidos`. Descartarlo en silencio bajaría el
 *     egreso del mes y haría ver rentable un mes que no lo es.
 *  3. **Un mes sin dato no es un mes barato.** Los 12 meses SIEMPRE están en la salida;
 *     los que no tienen todo lo que el año tuvo salen rotulados PARCIAL, con la lista
 *     de qué falta. Y el promedio del equilibrio los excluye diciendo por qué.
 *  4. **La brecha se mide contra los EGRESOS DEL MES, no contra el piso.** Es lo que
 *     hace el reporte que se está replicando (verificado contra sus propios números:
 *     enero 55.096 − 24.409,63 = 30.686,37) y es lo correcto: el piso es un promedio
 *     del año y la brecha es la pregunta de ese mes. El piso viaja aparte, como línea
 *     de referencia.
 */
import { periodoDe } from "@/lib/cobranza/planilla";

// ── Tipos de entrada ────────────────────────────────────────────────────────────

export type MonedaEq = "CRC" | "USD";

/** Los cinco rubros que componen el costo mensual. */
export type RubroEgreso =
  | "PLANILLA"
  | "HERRAMIENTA"
  | "FIJO_OPERACION"
  | "TARJETA"
  | "RESERVA_AGUINALDO";

/**
 * Qué tan firme es un número.
 *  - MEDIDO      alguien lo pagó y quedó registrado
 *  - PLANIFICADO el Excel lo trae para un mes que todavía no ocurrió
 *  - ESTIMADO    derivado, no plata que se movió (la reserva de aguinaldo)
 */
export type CalidadDato = "MEDIDO" | "PLANIFICADO" | "ESTIMADO";

/** Una línea de egreso de un mes, en su moneda nativa. */
export interface EgresoDeMes {
  periodo: string; // "YYYY-MM"
  rubro: RubroEgreso;
  concepto: string;
  conceptoClave: string;
  monto: number;
  moneda: MonedaEq;
  calidad: CalidadDato;
  /** La hoja no declaró la moneda y se dedujo del formato. Alimenta un aviso. */
  monedaInferida?: boolean;
}

/**
 * De qué naturaleza es una plata que entra.
 *  - COBRADO / POR_COBRAR  facturado (los dos suman al facturado del mes)
 *  - PROGRAMADO            ni siquiera se facturó — NO es ingreso, es backlog
 *  - COMISION_PARTNER      lo que deja un aliado, cobrado o no
 */
export type TipoIngreso = "COBRADO" | "POR_COBRAR" | "PROGRAMADO" | "COMISION_PARTNER";

export interface IngresoDeMes {
  periodo: string;
  tipo: TipoIngreso;
  monto: number;
  moneda: MonedaEq;
  /** Para el desglose. null en las comisiones de partner: no salen de un servicio. */
  tipoServicio: string | null;
  /** Solo para COMISION_PARTNER: si ya entró la plata. */
  cobrada?: boolean;
}

export interface TasaDeMes {
  periodo: string;
  crcPorUsd: number;
  fuente: string;
}

/**
 * Qué meses entran al promedio del equilibrio.
 *  - SOLO_MEDIDOS          únicamente los meses COMPLETOS que ya ocurrieron
 *  - INCLUIR_PLANIFICADOS  también los meses de plan (es lo que hizo el reporte
 *                          original al promediar abr–dic con dic sin ocurrir)
 */
export type VentanaEquilibrio = "SOLO_MEDIDOS" | "INCLUIR_PLANIFICADOS";

export interface OpcionesEquilibrio {
  anio: number;
  hoyISO: string; // "YYYY-MM-DD" — la fecha ENTRA, nunca se lee el reloj acá
  monedaPresentacion?: MonedaEq; // default USD
  tasas?: TasaDeMes[];
  ventana?: VentanaEquilibrio; // default SOLO_MEDIDOS
  colchones?: number[]; // default [10, 15]
  /** Divisor de la reserva de aguinaldo. 12 = la regla de Nexus; el Excel usa 10. */
  divisorAguinaldo?: number;
}

// ── Tipos de salida ─────────────────────────────────────────────────────────────

export type EstadoMes = "COMPLETO" | "PARCIAL";

export interface FilaMes {
  periodo: string;
  mes: number; // 1-12
  egresos: number;
  egresosPorRubro: Record<RubroEgreso, number>;
  facturado: number;
  cobrado: number;
  porCobrar: number;
  /** Entregado o programado y todavía sin facturar. NO suma a los ingresos. */
  pendienteFacturar: number;
  partnership: number;
  partnershipCobrado: number;
  ingresosTotales: number; // facturado + partnership
  /** ingresosTotales − egresos del mes. Negativa se muestra tal cual. */
  brecha: number;
  /** null cuando el mes es PARCIAL: no se puede afirmar que cubre habiendo contado de menos. */
  cubreEgresos: boolean | null;
  facturadoPorServicio: Record<string, number>;
  estado: EstadoMes;
  /** El mes todavía no ocurrió (según hoyISO). */
  futuro: boolean;
  /** Qué le falta a un mes PARCIAL, por nombre. Vacío si está completo. */
  faltantes: string[];
}

export type CodigoAviso =
  | "SIN_TIPO_DE_CAMBIO"
  | "MONEDA_INFERIDA"
  | "TARJETA_SOLAPA_HERRAMIENTAS"
  | "AGUINALDO_DIVISOR"
  | "MESES_PARCIALES"
  | "SIN_MESES_ELEGIBLES";

export interface AvisoCalidad {
  codigo: CodigoAviso;
  severidad: "ALTA" | "MEDIA" | "BAJA";
  mensaje: string;
  periodos: string[];
  conceptos: string[];
}

export interface ReporteEquilibrio {
  anio: number;
  hoyISO: string;
  monedaPresentacion: MonedaEq;
  meses: FilaMes[]; // SIEMPRE 12
  indicadores: {
    egresosTotales: number;
    facturadoTotal: number;
    cobradoTotal: number;
    porCobrarTotal: number;
    pendienteFacturarTotal: number;
    partnershipTotal: number;
    partnershipCobradoTotal: number;
    ingresosTotales: number;
    margenAnual: number;
    tasaCobro: number | null;
    mesesQueCubren: number;
    mesesConDato: number;
    mesesEgresoCompleto: number;
  };
  equilibrio: {
    base: number;
    metodo: "PROMEDIO_MENSUAL_TOTAL";
    ventana: VentanaEquilibrio;
    mesesUsados: string[];
    mesesExcluidos: Array<{ periodo: string; motivo: string }>;
    /** La cifra de la otra ventana, para que las dos se puedan comparar. */
    baseOtraVentana: number;
    metas: Array<{ colchonPct: number; monto: number; etiqueta: string }>;
    reservaAguinaldoMensual: number;
  };
  estructura: Array<{
    rubro: RubroEgreso;
    montoMensualPromedio: number;
    montoAnual: number;
    pctDelTotal: number;
    calidad: CalidadDato | "MIXTO";
  }>;
  ingresosPorServicio: Array<{
    tipoServicio: string;
    facturado: number;
    cobrado: number;
    porCobrar: number;
    pctDelFacturado: number;
  }>;
  calidad: {
    mesesCompletos: number;
    mesesParciales: number;
    avisos: AvisoCalidad[];
  };
  fx: {
    tasas: TasaDeMes[];
    periodosSinTasa: string[];
    montosNoConvertidos: Array<{ periodo: string; moneda: MonedaEq; monto: number; concepto: string }>;
    convertidos: number;
  };
}

// ── Constantes ──────────────────────────────────────────────────────────────────

/** Los cinco rubros, en el orden en que se leen en el reporte. */
export const RUBROS: readonly RubroEgreso[] = [
  "PLANILLA",
  "FIJO_OPERACION",
  "HERRAMIENTA",
  "RESERVA_AGUINALDO",
  "TARJETA",
] as const;

export const COLCHONES_DEFECTO: readonly number[] = [10, 15] as const;

/** La regla de Nexus, igual que en aguinaldo.ts. El Excel divide entre 10. */
export const DIVISOR_AGUINALDO_NEXUS = 12;

const round2 = (n: number) => Math.round(n * 100) / 100;

const rubrosEnCero = (): Record<RubroEgreso, number> => ({
  PLANILLA: 0,
  HERRAMIENTA: 0,
  FIJO_OPERACION: 0,
  TARJETA: 0,
  RESERVA_AGUINALDO: 0,
});

// ── Piezas ──────────────────────────────────────────────────────────────────────

/**
 * Los 12 períodos del año. SIEMPRE 12, aunque no haya un solo dato: una fila
 * ausente se lee en pantalla como "ese mes no gastamos nada".
 * Un año fuera de rango devuelve [] en vez de fabricar fechas.
 */
export function periodosDelAnio(anio: number): string[] {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return [];
  return Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Convierte a la moneda de presentación con la tasa de ESE mes.
 *
 * null = no se pudo. El llamador lo reporta; no se cae a la tasa de otro mes ni se
 * asume paridad. Una tasa ≤ 0 se rechaza: dividir por ahí produce Infinity y el total
 * del año se vuelve ilegible sin que nada avise.
 */
export function convertir(
  monto: number,
  desde: MonedaEq,
  hasta: MonedaEq,
  tasa: TasaDeMes | null,
): { monto: number; convertido: boolean } | null {
  if (desde === hasta) return { monto: round2(monto), convertido: false };
  if (!tasa || !Number.isFinite(tasa.crcPorUsd) || tasa.crcPorUsd <= 0) return null;
  const convertidoMonto = desde === "CRC" ? monto / tasa.crcPorUsd : monto * tasa.crcPorUsd;
  return { monto: round2(convertidoMonto), convertido: true };
}

/**
 * base + colchón%. Los porcentajes son EDITABLES, no tasas del negocio: son cuánto
 * margen quiere tener alguien encima del piso.
 */
export function metasDe(
  base: number,
  colchones: readonly number[] = COLCHONES_DEFECTO,
): Array<{ colchonPct: number; monto: number; etiqueta: string }> {
  return colchones
    .filter((c) => Number.isFinite(c) && c >= 0)
    .map((colchonPct) => ({
      colchonPct,
      monto: round2(base * (1 + colchonPct / 100)),
      etiqueta: colchonPct === 0 ? "el piso" : `piso +${colchonPct}%`,
    }));
}

/**
 * La brecha del mes: lo que entró menos lo que salió.
 *
 * Negativa se devuelve NEGATIVA (nada de Math.abs): un déficit que se muestra como
 * número positivo con otro color se lee mal en una tabla y peor en una captura.
 */
export function brechaDe(
  ingresos: number,
  egresos: number,
): { brecha: number; cubre: boolean; pctCobertura: number | null } {
  return {
    brecha: round2(ingresos - egresos),
    cubre: ingresos >= egresos,
    pctCobertura: egresos === 0 ? null : Math.round((ingresos / egresos) * 1000) / 10,
  };
}

/**
 * La reserva mensual del aguinaldo: el total del año dividido entre los meses.
 *
 * Es un DATO OBSERVADO ÷ meses, no una tasa — misma doctrina que `aguinaldo.ts`, que
 * es de donde sale el total. El divisor entra por parámetro porque hay dos números
 * vivos: Nexus divide entre 12 y el Excel de Alex entre 10. Ninguno es "el bug", así
 * que el reporte muestra el de Nexus y declara el otro.
 */
export function reservaAguinaldoMensual(totalAnual: number, divisor = DIVISOR_AGUINALDO_NEXUS): number {
  if (!Number.isFinite(divisor) || divisor <= 0) return 0;
  return round2(totalAnual / divisor);
}

/**
 * El promedio de los egresos mensuales — el punto de equilibrio.
 *
 * Devuelve, además del número, POR QUÉ cada mes entró o quedó afuera. Un promedio sin
 * su lista de meses es un número que nadie puede discutir: la mitad de las veces que
 * dos personas no coinciden en el equilibrio es porque promediaron meses distintos.
 */
export function promedioMensual(
  meses: readonly FilaMes[],
  ventana: VentanaEquilibrio,
): { promedio: number; mesesUsados: string[]; mesesExcluidos: Array<{ periodo: string; motivo: string }> } {
  const usados: FilaMes[] = [];
  const excluidos: Array<{ periodo: string; motivo: string }> = [];

  for (const m of meses) {
    if (m.egresos <= 0) {
      excluidos.push({ periodo: m.periodo, motivo: "sin egresos registrados" });
      continue;
    }
    if (m.estado === "PARCIAL") {
      excluidos.push({
        periodo: m.periodo,
        motivo: m.faltantes.length > 0 ? `falta ${m.faltantes.join(", ")}` : "mes incompleto",
      });
      continue;
    }
    if (m.futuro && ventana === "SOLO_MEDIDOS") {
      excluidos.push({ periodo: m.periodo, motivo: "todavía no ocurre (dato de plan)" });
      continue;
    }
    usados.push(m);
  }

  const promedio = usados.length === 0 ? 0 : round2(usados.reduce((n, m) => n + m.egresos, 0) / usados.length);
  return { promedio, mesesUsados: usados.map((m) => m.periodo), mesesExcluidos: excluidos };
}

/**
 * Qué conceptos de cada rubro son RECURRENTES, o sea los que deberían estar todos los
 * meses. Un concepto cuenta como recurrente si aparece en al menos la mitad de los
 * meses en que su rubro tuvo datos.
 *
 * ⚠ ESTE FILTRO ES LA DIFERENCIA ENTRE UN REPORTE QUE FUNCIONA Y UNO QUE NO, y lo
 * descubrieron los datos reales: la primera versión exigía TODOS los conceptos del año
 * en todos los meses, y con eso el hosting que se paga una vez en abril y el DIVI que
 * se paga una vez en julio dejaban a los otros once meses "incompletos". Los doce meses
 * salían PARCIAL, ninguno entraba al promedio y el punto de equilibrio daba CERO —
 * técnicamente coherente y completamente inútil. Un pago anual no FALTA en los meses en
 * que no toca: simplemente no toca.
 */
export function conceptosRecurrentes(
  egresos: readonly EgresoDeMes[],
  umbral = 0.5,
): Map<RubroEgreso, Map<string, string>> {
  const mesesPorRubro = new Map<RubroEgreso, Set<string>>();
  const mesesPorConcepto = new Map<string, Set<string>>();
  for (const e of egresos) {
    if (!mesesPorRubro.has(e.rubro)) mesesPorRubro.set(e.rubro, new Set());
    mesesPorRubro.get(e.rubro)!.add(e.periodo);
    const k = `${e.rubro}::${e.conceptoClave}`;
    if (!mesesPorConcepto.has(k)) mesesPorConcepto.set(k, new Set());
    mesesPorConcepto.get(k)!.add(e.periodo);
  }
  const out = new Map<RubroEgreso, Map<string, string>>();
  for (const [k, meses] of mesesPorConcepto) {
    const [rubro, clave] = k.split("::") as [RubroEgreso, string];
    // ⚠ EL DENOMINADOR ARRANCA EN EL PRIMER MES DEL CONCEPTO, no en enero. Supabase
    // empezó a cobrarse en junio: contra el año entero da 7/12 y "faltaría" en abril
    // y mayo, meses en que la herramienta todavía no existía. Contra su propia
    // ventana da 7/7 y solo se espera desde junio. La fecha de INICIO es un dato
    // firme; la de fin no —"ya no aparece" puede ser "terminó" o "falta el dato"—,
    // así que la ventana se abre pero no se cierra.
    const desde = [...meses].sort()[0]!;
    const delRubroDesde = [...(mesesPorRubro.get(rubro) ?? [])].filter((m) => m >= desde).length;
    if (delRubroDesde === 0 || meses.size / delRubroDesde < umbral) continue;
    if (!out.has(rubro)) out.set(rubro, new Map());
    out.get(rubro)!.set(clave, desde);
  }
  return out;
}

/**
 * COMPLETO o PARCIAL. Dos preguntas, no una:
 *   (a) ¿está presente cada RUBRO que el año tuvo? — ene-mar no tienen costos fijos
 *       porque ese bloque del Excel está oculto, y eso sí es un hueco real.
 *   (b) ¿están los conceptos RECURRENTES de cada rubro? — así una quincena de planilla
 *       que falta se ve, sin que un pago anual ensucie los otros once meses.
 *
 * No se guarda en la base a propósito: el mismo mes cambia de calidad cuando llega el
 * dato que le faltaba, y una etiqueta persistida se quedaría vieja sin que nadie mire.
 * `faltantes` NOMBRA lo que falta — "8 de 11 conceptos" no le sirve a nadie para actuar.
 */
export function calidadDelMes(
  periodo: string,
  presentesPorRubro: Map<RubroEgreso, Set<string>>,
  esperadosPorRubro: Map<RubroEgreso, Map<string, string>>,
  rubrosDelAnio: ReadonlySet<RubroEgreso>,
  hayEgresos: boolean,
): { estado: EstadoMes; faltantes: string[] } {
  if (!hayEgresos) return { estado: "PARCIAL", faltantes: ["todo el mes"] };
  const faltantes: string[] = [];
  for (const rubro of rubrosDelAnio) {
    const presentes = presentesPorRubro.get(rubro) ?? new Set<string>();
    if (presentes.size === 0) {
      faltantes.push(etiquetaRubro(rubro));
      continue;
    }
    const ausentes = [...(esperadosPorRubro.get(rubro) ?? new Map<string, string>())]
      // Solo se exige desde que el concepto existe: antes de su primer mes no falta.
      .filter(([clave, desde]) => periodo >= desde && !presentes.has(clave))
      .map(([clave]) => clave);
    if (ausentes.length > 0) {
      faltantes.push(
        ausentes.slice(0, 3).join(", ") + (ausentes.length > 3 ? ` y ${ausentes.length - 3} más` : ""),
      );
    }
  }
  return { estado: faltantes.length === 0 ? "COMPLETO" : "PARCIAL", faltantes };
}

/** Nombre legible de un rubro, para los faltantes y la estructura de costos. */
export function etiquetaRubro(r: RubroEgreso): string {
  switch (r) {
    case "PLANILLA":
      return "planilla";
    case "HERRAMIENTA":
      return "herramientas";
    case "FIJO_OPERACION":
      return "costos fijos";
    case "TARJETA":
      return "tarjetas";
    case "RESERVA_AGUINALDO":
      return "reserva de aguinaldo";
  }
}

// ── La función ──────────────────────────────────────────────────────────────────

/**
 * El reporte completo. Todo lo de arriba, compuesto.
 *
 * Orden de las cuentas, que importa: primero se convierte (declarando lo que no se
 * pudo), después se arma cada mes, después se deriva la calidad contra el roster del
 * año, y recién ahí se promedia. Promediar antes de saber qué meses están completos es
 * el error que hace que el piso salga bajo y nadie lo note.
 */
export function calcularEquilibrio(
  egresos: readonly EgresoDeMes[],
  ingresos: readonly IngresoDeMes[],
  opciones: OpcionesEquilibrio,
): ReporteEquilibrio {
  const moneda = opciones.monedaPresentacion ?? "USD";
  const ventana = opciones.ventana ?? "SOLO_MEDIDOS";
  const tasas = opciones.tasas ?? [];
  const periodos = periodosDelAnio(opciones.anio);
  const tasaPorPeriodo = new Map(tasas.map((t) => [t.periodo, t]));
  const periodoHoy = periodoDe(opciones.hoyISO);

  const noConvertidos: ReporteEquilibrio["fx"]["montosNoConvertidos"] = [];
  const periodosSinTasa = new Set<string>();
  let convertidos = 0;

  /** Convierte y, si no puede, lo anota y devuelve null (nunca un cero silencioso). */
  const aPresentacion = (monto: number, m: MonedaEq, periodo: string, concepto: string): number | null => {
    const r = convertir(monto, m, moneda, tasaPorPeriodo.get(periodo) ?? null);
    if (r === null) {
      noConvertidos.push({ periodo, moneda: m, monto, concepto });
      periodosSinTasa.add(periodo);
      return null;
    }
    if (r.convertido) convertidos++;
    return r.monto;
  };

  // ── Egresos por mes y rubro, más el roster del año ────────────────────────────
  const porMes = new Map<string, { rubros: Record<RubroEgreso, number>; presentes: Map<RubroEgreso, Set<string>>; calidades: Set<CalidadDato> }>();
  for (const p of periodos) {
    porMes.set(p, { rubros: rubrosEnCero(), presentes: new Map(), calidades: new Set() });
  }
  const rubrosDelAnio = new Set<RubroEgreso>();
  const calidadPorRubro = new Map<RubroEgreso, Set<CalidadDato>>();
  const conceptosInferidos = new Set<string>();
  // Qué se ESPERA cada mes: solo lo recurrente. Un pago anual no falta once veces.
  const esperados = conceptosRecurrentes(egresos.filter((e) => porMes.has(e.periodo)));

  for (const e of egresos) {
    const mes = porMes.get(e.periodo);
    if (!mes) continue; // fuera del año pedido
    const monto = aPresentacion(e.monto, e.moneda, e.periodo, e.concepto);
    if (monto === null) continue;

    mes.rubros[e.rubro] = round2(mes.rubros[e.rubro] + monto);
    if (!mes.presentes.has(e.rubro)) mes.presentes.set(e.rubro, new Set());
    mes.presentes.get(e.rubro)!.add(e.conceptoClave);
    mes.calidades.add(e.calidad);

    rubrosDelAnio.add(e.rubro);
    if (!calidadPorRubro.has(e.rubro)) calidadPorRubro.set(e.rubro, new Set());
    calidadPorRubro.get(e.rubro)!.add(e.calidad);
    if (e.monedaInferida) conceptosInferidos.add(e.concepto);
  }

  // ── Ingresos por mes ──────────────────────────────────────────────────────────
  type AccIngreso = {
    cobrado: number;
    porCobrar: number;
    pendiente: number;
    partnership: number;
    partnershipCobrado: number;
    porServicio: Record<string, number>;
  };
  const ingMes = new Map<string, AccIngreso>();
  for (const p of periodos) {
    ingMes.set(p, { cobrado: 0, porCobrar: 0, pendiente: 0, partnership: 0, partnershipCobrado: 0, porServicio: {} });
  }
  const porServicioAnual = new Map<string, { facturado: number; cobrado: number; porCobrar: number }>();

  for (const i of ingresos) {
    const acc = ingMes.get(i.periodo);
    if (!acc) continue;
    const monto = aPresentacion(i.monto, i.moneda, i.periodo, i.tipoServicio ?? "comisión de aliado");
    if (monto === null) continue;

    if (i.tipo === "COMISION_PARTNER") {
      acc.partnership = round2(acc.partnership + monto);
      if (i.cobrada) acc.partnershipCobrado = round2(acc.partnershipCobrado + monto);
      continue;
    }
    if (i.tipo === "PROGRAMADO") {
      acc.pendiente = round2(acc.pendiente + monto);
      continue;
    }
    if (i.tipo === "COBRADO") acc.cobrado = round2(acc.cobrado + monto);
    else acc.porCobrar = round2(acc.porCobrar + monto);

    // El desglose por servicio es del FACTURADO (cobrado + por cobrar).
    const k = i.tipoServicio ?? "OTRO";
    acc.porServicio[k] = round2((acc.porServicio[k] ?? 0) + monto);
    const g = porServicioAnual.get(k) ?? { facturado: 0, cobrado: 0, porCobrar: 0 };
    g.facturado = round2(g.facturado + monto);
    if (i.tipo === "COBRADO") g.cobrado = round2(g.cobrado + monto);
    else g.porCobrar = round2(g.porCobrar + monto);
    porServicioAnual.set(k, g);
  }

  // ── Las 12 filas ──────────────────────────────────────────────────────────────
  const meses: FilaMes[] = periodos.map((periodo, idx) => {
    const eg = porMes.get(periodo)!;
    const ing = ingMes.get(periodo)!;
    const egresosMes = round2(RUBROS.reduce((n, r) => n + eg.rubros[r], 0));
    const facturado = round2(ing.cobrado + ing.porCobrar);
    const ingresosTotales = round2(facturado + ing.partnership);
    const futuro = periodo > periodoHoy;
    const { estado, faltantes } = calidadDelMes(periodo, eg.presentes, esperados, rubrosDelAnio, egresosMes > 0);
    const { brecha, cubre } = brechaDe(ingresosTotales, egresosMes);

    return {
      periodo,
      mes: idx + 1,
      egresos: egresosMes,
      egresosPorRubro: eg.rubros,
      facturado,
      cobrado: ing.cobrado,
      porCobrar: ing.porCobrar,
      pendienteFacturar: ing.pendiente,
      partnership: ing.partnership,
      partnershipCobrado: ing.partnershipCobrado,
      ingresosTotales,
      brecha,
      // Afirmar que un mes "cubre egresos" habiendo contado la mitad de los costos es
      // la mentira más fácil de este reporte. Con el mes parcial, no se afirma.
      cubreEgresos: estado === "PARCIAL" ? null : cubre,
      facturadoPorServicio: ing.porServicio,
      estado,
      futuro,
      faltantes,
    };
  });

  // ── El equilibrio, en sus dos ventanas ────────────────────────────────────────
  const principal = promedioMensual(meses, ventana);
  const otra = promedioMensual(meses, ventana === "SOLO_MEDIDOS" ? "INCLUIR_PLANIFICADOS" : "SOLO_MEDIDOS");

  const totalAguinaldoAnual = meses.reduce((n, m) => n + m.egresosPorRubro.RESERVA_AGUINALDO, 0);

  // ── Estructura de costos ──────────────────────────────────────────────────────
  const egresosTotales = round2(meses.reduce((n, m) => n + m.egresos, 0));
  const mesesConEgreso = meses.filter((m) => m.egresos > 0).length;
  const estructura = RUBROS.map((rubro) => {
    const montoAnual = round2(meses.reduce((n, m) => n + m.egresosPorRubro[rubro], 0));
    const cal = calidadPorRubro.get(rubro);
    return {
      rubro,
      montoAnual,
      montoMensualPromedio: mesesConEgreso === 0 ? 0 : round2(montoAnual / mesesConEgreso),
      pctDelTotal: egresosTotales === 0 ? 0 : Math.round((montoAnual / egresosTotales) * 1000) / 10,
      calidad: (!cal || cal.size === 0 ? "MEDIDO" : cal.size === 1 ? [...cal][0]! : "MIXTO") as CalidadDato | "MIXTO",
    };
  });

  // ── Indicadores del año ───────────────────────────────────────────────────────
  const suma = (f: (m: FilaMes) => number) => round2(meses.reduce((n, m) => n + f(m), 0));
  const facturadoTotal = suma((m) => m.facturado);
  const ingresosTotalesAnio = suma((m) => m.ingresosTotales);
  const cobradoTotal = suma((m) => m.cobrado);

  // ── Avisos de calidad ─────────────────────────────────────────────────────────
  const avisos: AvisoCalidad[] = [];
  const parciales = meses.filter((m) => m.estado === "PARCIAL");
  if (periodosSinTasa.size > 0) {
    avisos.push({
      codigo: "SIN_TIPO_DE_CAMBIO",
      severidad: "ALTA",
      mensaje: `Falta el tipo de cambio de ${periodosSinTasa.size} mes(es): esos montos NO entraron a los totales. Cargalos para que el año cierre.`,
      periodos: [...periodosSinTasa].sort(),
      conceptos: [...new Set(noConvertidos.map((n) => n.concepto))].slice(0, 10),
    });
  }
  const mesesConTarjeta = meses.filter((m) => m.egresosPorRubro.TARJETA > 0 && m.egresosPorRubro.HERRAMIENTA > 0);
  if (mesesConTarjeta.length > 0) {
    avisos.push({
      codigo: "TARJETA_SOLAPA_HERRAMIENTAS",
      severidad: "ALTA",
      mensaje:
        "El cargo de tarjeta y las herramientas se suman los dos. Si parte de las herramientas se paga CON esa tarjeta, el piso está inflado — el solape no se puede medir desde el Excel, así que se declara en vez de decidirlo en silencio.",
      periodos: mesesConTarjeta.map((m) => m.periodo),
      conceptos: [],
    });
  }
  if (conceptosInferidos.size > 0) {
    avisos.push({
      codigo: "MONEDA_INFERIDA",
      severidad: "MEDIA",
      mensaje: `${conceptosInferidos.size} concepto(s) traen la moneda deducida del formato de la celda, no declarada en la hoja.`,
      periodos: [],
      conceptos: [...conceptosInferidos].slice(0, 10),
    });
  }
  if (totalAguinaldoAnual > 0) {
    avisos.push({
      codigo: "AGUINALDO_DIVISOR",
      severidad: "BAJA",
      mensaje: `La reserva de aguinaldo se calcula dividiendo entre ${opciones.divisorAguinaldo ?? DIVISOR_AGUINALDO_NEXUS}. El Excel divide entre 10 y da otro número; ninguno de los dos es un error, son dos criterios.`,
      periodos: [],
      conceptos: [],
    });
  }
  if (parciales.length > 0) {
    avisos.push({
      codigo: "MESES_PARCIALES",
      severidad: "MEDIA",
      mensaje: `${parciales.length} de 12 meses no tienen todo el egreso del año cargado. Quedan fuera del promedio y su brecha es optimista.`,
      periodos: parciales.map((m) => m.periodo),
      conceptos: [],
    });
  }
  if (principal.mesesUsados.length === 0) {
    avisos.push({
      codigo: "SIN_MESES_ELEGIBLES",
      severidad: "ALTA",
      mensaje:
        "Ningún mes califica para el promedio, así que el piso queda en cero. Un promedio de cero meses no es un piso de cero pesos: el reporte no puede afirmar todavía cuánto hay que facturar.",
      periodos: [],
      conceptos: [],
    });
  }

  return {
    anio: opciones.anio,
    hoyISO: opciones.hoyISO,
    monedaPresentacion: moneda,
    meses,
    indicadores: {
      egresosTotales,
      facturadoTotal,
      cobradoTotal,
      porCobrarTotal: suma((m) => m.porCobrar),
      pendienteFacturarTotal: suma((m) => m.pendienteFacturar),
      partnershipTotal: suma((m) => m.partnership),
      partnershipCobradoTotal: suma((m) => m.partnershipCobrado),
      ingresosTotales: ingresosTotalesAnio,
      margenAnual: round2(ingresosTotalesAnio - egresosTotales),
      tasaCobro: facturadoTotal === 0 ? null : Math.round((cobradoTotal / facturadoTotal) * 1000) / 1000,
      mesesQueCubren: meses.filter((m) => m.cubreEgresos === true).length,
      mesesConDato: meses.filter((m) => m.facturado > 0 || m.egresos > 0).length,
      mesesEgresoCompleto: meses.filter((m) => m.estado === "COMPLETO").length,
    },
    equilibrio: {
      base: principal.promedio,
      metodo: "PROMEDIO_MENSUAL_TOTAL",
      ventana,
      mesesUsados: principal.mesesUsados,
      mesesExcluidos: principal.mesesExcluidos,
      baseOtraVentana: otra.promedio,
      metas: metasDe(principal.promedio, opciones.colchones ?? COLCHONES_DEFECTO),
      reservaAguinaldoMensual: reservaAguinaldoMensual(
        totalAguinaldoAnual,
        opciones.divisorAguinaldo ?? DIVISOR_AGUINALDO_NEXUS,
      ),
    },
    estructura,
    ingresosPorServicio: [...porServicioAnual.entries()]
      .map(([tipoServicio, g]) => ({
        tipoServicio,
        facturado: g.facturado,
        cobrado: g.cobrado,
        porCobrar: g.porCobrar,
        pctDelFacturado: facturadoTotal === 0 ? 0 : Math.round((g.facturado / facturadoTotal) * 1000) / 10,
      }))
      .sort((a, b) => b.facturado - a.facturado),
    calidad: {
      mesesCompletos: meses.filter((m) => m.estado === "COMPLETO").length,
      mesesParciales: parciales.length,
      avisos,
    },
    fx: {
      tasas,
      periodosSinTasa: [...periodosSinTasa].sort(),
      montosNoConvertidos: noConvertidos,
      convertidos,
    },
  };
}
