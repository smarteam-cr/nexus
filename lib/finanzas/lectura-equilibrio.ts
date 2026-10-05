/**
 * lib/finanzas/lectura-equilibrio.ts — lo que la página del punto de equilibrio lee del reporte para contestar sus
 * preguntas (rediseño para RevOps, CFO y CEO, 2026-10-05).
 *
 * No calcula nada nuevo sobre la plata: reparte lo que `calcularEquilibrio` ya midió en las respuestas que la página
 * da arriba de todo —¿alcanza lo facturado para el piso?, ¿cuánto es el margen y de dónde sale?, ¿por qué es
 * preliminar?, ¿qué viene?— para que el texto y los números no se escriban dos veces ni en dos lugares.
 *
 * PURO: sin Prisma, sin red, sin reloj (`hoyISO` entra por parámetro).
 */
import type { FilaMes, ReporteEquilibrio } from "./equilibrio";
import { esFaltanteDePlanilla } from "./cierre";

const round2 = (n: number) => Math.round(n * 100) / 100;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const nombreDelMes = (periodo: string) => MESES[Number(periodo.slice(5, 7)) - 1] ?? periodo;

/** «abril a julio», «agosto», «enero, marzo y mayo». Corridos se dicen como rango; sueltos, como lista. */
export function rangoDeMeses(periodos: readonly string[]): string {
  const ps = [...periodos].sort();
  if (ps.length === 0) return "";
  const n = (p: string) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7));
  const corridos = ps.every((p, i) => i === 0 || n(p) === n(ps[i - 1]!) + 1);
  if (ps.length === 1) return nombreDelMes(ps[0]!);
  if (corridos) return `${nombreDelMes(ps[0]!)} a ${nombreDelMes(ps[ps.length - 1]!)}`;
  const nombres = ps.map(nombreDelMes);
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

type Reporte = Pick<ReporteEquilibrio, "meses" | "pisoVigente" | "equilibrio" | "indicadores">;

const pasados = (meses: readonly FilaMes[], hoyISO: string) => meses.filter((m) => m.periodo < hoyISO.slice(0, 7));

/** El piso que manda (el de hoy) y su meta con el 10 % de colchón. */
export function pisoDe(r: Pick<Reporte, "pisoVigente" | "equilibrio">): { piso: number; meta: number | null } {
  const piso = r.pisoVigente?.base ?? r.equilibrio.base;
  const metas = r.pisoVigente?.metas ?? r.equilibrio.metas;
  return { piso, meta: metas.find((m) => m.colchonPct === 10)?.monto ?? null };
}

export interface RespuestaDelAnio {
  piso: number;
  meta: number | null;
  /** Los meses que ya terminaron, que son los que se promedian. */
  meses: string[];
  promedioFacturado: number;
  /** Lo facturado más lo que pagaron los aliados (confirmado), por mes. */
  promedioConAliados: number;
  /** Los meses en que pagaron los aliados. */
  mesesConAliados: string[];
  /** Cuánto falta por mes sin los aliados (0 si alcanza). */
  faltaSinAliados: number;
  /** Cuánto sobra por mes con los aliados (negativo si tampoco alcanza). */
  sobraConAliados: number;
}

/** ¿Alcanza lo que se factura para cubrir lo que cuesta operar hoy? Sobre los meses que ya terminaron. */
export function respuestaDelAnio(r: Reporte, hoyISO: string): RespuestaDelAnio | null {
  const ms = pasados(r.meses, hoyISO);
  if (ms.length === 0) return null;
  const { piso, meta } = pisoDe(r);
  const promedioFacturado = round2(ms.reduce((s, m) => s + m.facturado, 0) / ms.length);
  const promedioConAliados = round2(ms.reduce((s, m) => s + m.facturado + m.partnership, 0) / ms.length);
  return {
    piso,
    meta,
    meses: ms.map((m) => m.periodo),
    promedioFacturado,
    promedioConAliados,
    mesesConAliados: ms.filter((m) => m.partnership > 0).map((m) => m.periodo),
    faltaSinAliados: round2(Math.max(0, piso - promedioFacturado)),
    sobraConAliados: round2(promedioConAliados - piso),
  };
}

export interface DesgloseDelMargen {
  meses: string[];
  ingresos: number;
  facturado: number;
  /** Lo de los aliados que entró a los ingresos (cero si dirección decidió que no cuenta). */
  aliados: number;
  gasto: number;
  margen: number;
  /** El margen sin los aliados. Solo tiene sentido si `aliados` > 0. */
  sinAliados: number;
  /** Lo que entró al banco menos lo que salió, en los mismos meses. */
  caja: number;
}

/** De dónde sale el margen a la fecha: los mismos meses y las mismas cuentas que `margenDeMesesCompletos`. */
export function desgloseDelMargen(r: Reporte): DesgloseDelMargen | null {
  const meses = r.indicadores.mesesDelMargen;
  if (meses.length === 0) return null;
  const ms = r.meses.filter((m) => meses.includes(m.periodo));
  const suma = (f: (m: FilaMes) => number) => round2(ms.reduce((s, m) => s + f(m), 0));
  const aliados = suma((m) => m.partnershipEnIngresos);
  return {
    meses,
    ingresos: suma((m) => m.ingresosTotales),
    facturado: suma((m) => m.facturado),
    aliados,
    gasto: suma((m) => m.egresos),
    margen: r.indicadores.margenAlDia,
    sinAliados: round2(r.indicadores.margenAlDia - aliados),
    caja: round2(r.indicadores.cajaAlDia - r.indicadores.egresosDeCajaTotal),
  };
}

/** Un faltante del reporte, dicho para una persona. */
export function faltanteLegible(f: string): string {
  if (f === "planilla") return "la planilla";
  const q = /^planilla-q(\d)$/.exec(f);
  if (q) return `la ${q[1]}ª quincena de planilla`;
  if (f === "gastos del mes sin confirmar") return "el aviso de que los gastos están todos";
  if (f === "todo el mes") return "gasto anotado";
  return f;
}

export interface PorQueEsPreliminar {
  preliminar: boolean;
  razones: string[];
  /** Qué tiene que pasar para que deje de serlo. Vacío si ya no es preliminar. */
  cuando: string;
}

/**
 * Por qué el margen a la fecha es preliminar, en palabras. Es preliminar mientras algún mes del margen no esté cerrado
 * por el CFO o su tipo de cambio no sea firme: desde 2026-10-05, el del Banco Central con todos sus días (o, en un mes
 * sin días del BCCR, uno confirmado por una persona). Que el margen cuente solo los meses con el gasto completo no lo
 * hace preliminar —es su regla—, pero se dice, porque es lo primero que alguien pregunta.
 *
 * `tasaManual`: la tasa cargada a mano que comparten los meses sin días del BCCR (el ₡500 de siempre), o null si
 * difieren. `mesesDelBccr`: los meses que ya tienen días del Banco Central, completos o no.
 */
export function porQueEsPreliminar(
  r: Pick<Reporte, "meses" | "indicadores">,
  hoyISO: string,
  cerrados: ReadonlySet<string>,
  tasasConfirmadas: ReadonlySet<string>,
  tasaManual: number | null,
  mesesDelBccr: ReadonlySet<string> = new Set(),
): PorQueEsPreliminar {
  const delMargen = r.indicadores.mesesDelMargen;
  const razones: string[] = [];

  // Qué meses quedan afuera y por qué, juntando los corridos que tienen el mismo faltante.
  const afuera = pasados(r.meses, hoyISO).filter((m) => !delMargen.includes(m.periodo));
  if (delMargen.length > 0 && afuera.length > 0) {
    const grupos: Array<{ periodos: string[]; falta: string }> = [];
    for (const m of afuera) {
      const sinPlanilla = m.faltantes.filter((f) => !esFaltanteDePlanilla(f));
      const dePlanilla = m.faltantes.filter(esFaltanteDePlanilla);
      const falta = [...sinPlanilla, ...dePlanilla].map(faltanteLegible).join(" ni ") || "parte del gasto";
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.falta === falta) ultimo.periodos.push(m.periodo);
      else grupos.push({ periodos: [m.periodo], falta });
    }
    // «Enero a marzo, sin costos fijos ni tarjetas; agosto, sin la 2ª quincena de planilla.» Con «sin» no hay que
    // concordar el verbo con lo que falta.
    const detalle = grupos.map((g) => `${rangoDeMeses(g.periodos)}, sin ${g.falta}`).join("; ");
    razones.push(
      `Solo cuenta ${rangoDeMeses(delMargen)}: ${delMargen.length === 1 ? "es el único mes" : "son los únicos meses"} con el gasto completo. ${detalle[0]!.toUpperCase()}${detalle.slice(1)}.`,
    );
  }

  const sinCerrar = delMargen.filter((p) => !cerrados.has(p));
  if (sinCerrar.length > 0) {
    razones.push(
      sinCerrar.length === delMargen.length
        ? `Ninguno de ${delMargen.length === 1 ? "ese mes" : `esos ${delMargen.length} meses`} está cerrado por el CFO.`
        : `${rangoDeMeses(sinCerrar).replace(/^./, (c) => c.toUpperCase())} ${sinCerrar.length === 1 ? "no está cerrado" : "no están cerrados"} por el CFO.`,
    );
  }

  const sinConfirmar = delMargen.filter((p) => !tasasConfirmadas.has(p));
  const sinBccr = sinConfirmar.filter((p) => !mesesDelBccr.has(p));
  const aMedias = sinConfirmar.filter((p) => mesesDelBccr.has(p));
  if (sinBccr.length > 0) {
    razones.push(
      sinBccr.length === delMargen.length && tasaManual !== null
        ? `Usa ₡${tasaManual.toLocaleString("es-CR")} por dólar, no el tipo de cambio del Banco Central.`
        : `${rangoDeMeses(sinBccr).replace(/^./, (c) => c.toUpperCase())} ${sinBccr.length === 1 ? "usa" : "usan"} un tipo de cambio cargado a mano, no el del Banco Central.`,
    );
  }
  if (aMedias.length > 0) {
    razones.push(
      `${rangoDeMeses(aMedias).replace(/^./, (c) => c.toUpperCase())} todavía no ${aMedias.length === 1 ? "tiene" : "tienen"} todos los días del tipo de cambio del Banco Central.`,
    );
  }

  const preliminar = sinCerrar.length > 0 || sinConfirmar.length > 0;
  const pasos = [
    sinCerrar.length > 0 ? `el CFO cierre ${rangoDeMeses(sinCerrar)}` : null,
    sinConfirmar.length > 0 ? "esté el tipo de cambio del Banco Central de esos meses" : null,
  ].filter(Boolean);
  return { preliminar, razones, cuando: preliminar ? `Deja de ser preliminar cuando ${pasos.join(" y ")}.` : "" };
}

export interface LoQueViene {
  meses: string[];
  /** Lo ya facturado y lo programado sin factura, del mes en curso a diciembre. */
  facturadoYProgramado: number;
  pisoDelPeriodo: number;
  /** Cuánto falta para el piso (negativo = sobra). */
  falta: number;
}

/** Del mes en curso a fin de año: lo que ya hay (facturado y programado) contra el piso de esos meses. */
export function loQueViene(r: Reporte, hoyISO: string): LoQueViene | null {
  const ms = r.meses.filter((m) => m.periodo >= hoyISO.slice(0, 7));
  if (ms.length === 0) return null;
  const { piso } = pisoDe(r);
  const facturadoYProgramado = round2(ms.reduce((s, m) => s + m.facturado + m.pendienteFacturar, 0));
  const pisoDelPeriodo = round2(piso * ms.length);
  return { meses: ms.map((m) => m.periodo), facturadoYProgramado, pisoDelPeriodo, falta: round2(pisoDelPeriodo - facturadoYProgramado) };
}

export type ClaveDeEstado = "cerrado" | "cambio" | "sinCerrar" | "faltaGasto" | "faltaPlanilla" | "enCurso" | "porVenir";

export interface EstadoDeMes {
  clave: ClaveDeEstado;
  etiqueta: string;
  /** Qué le falta o qué pasó, en una frase. */
  detalle: string;
  /** El mes ya terminó y tiene el gasto incompleto: el gráfico lo marca en gris. */
  incompleto: boolean;
}

/** Cómo está un mes, para el chip debajo del gráfico y la lectura del mes. */
export function estadoDelMes(
  m: Pick<FilaMes, "periodo" | "futuro" | "estado" | "faltantes">,
  cierre: { cambio: boolean | null } | undefined,
  hoyISO: string,
): EstadoDeMes {
  const actual = hoyISO.slice(0, 7);
  if (m.periodo > actual) return { clave: "porVenir", etiqueta: "Por venir", detalle: "Todavía no pasó: solo hay lo programado.", incompleto: false };
  if (m.periodo === actual) return { clave: "enCurso", etiqueta: "En curso", detalle: "El mes está en curso.", incompleto: false };
  if (cierre?.cambio) return { clave: "cambio", etiqueta: "Cambió después del cierre", detalle: "Se cerró y algún número cambió después.", incompleto: false };
  if (cierre) return { clave: "cerrado", etiqueta: "Cerrado", detalle: "El CFO lo cerró: sus números quedaron guardados.", incompleto: false };
  if (m.estado === "COMPLETO") return { clave: "sinCerrar", etiqueta: "Sin cerrar", detalle: "El gasto está completo, falta que el CFO lo cierre.", incompleto: false };
  const falta = `Gasto incompleto: sin ${m.faltantes.map(faltanteLegible).join(" ni ") || "parte del dato"}.`;
  if (m.faltantes.length > 0 && m.faltantes.every(esFaltanteDePlanilla)) return { clave: "faltaPlanilla", etiqueta: "Falta planilla", detalle: falta, incompleto: true };
  return { clave: "faltaGasto", etiqueta: "Falta gasto", detalle: falta, incompleto: true };
}

export interface MesSimulado {
  periodo: string;
  total: number;
  alcanza: boolean;
  /** Cuánto le falta para el piso (0 si alcanza). */
  falta: number;
}

export interface Simulacion {
  meses: MesSimulado[];
  total: number;
  pisoDelPeriodo: number;
  /** Positivo: sobra. Negativo: falta. */
  diferencia: number;
  /** Lo que falta por mes, repartido parejo (0 si alcanza). */
  faltaPorMes: number;
}

/**
 * «¿Y si…?» del mes en curso a diciembre: lo que se facturaría cada mes (por defecto, lo facturado y lo programado),
 * si se cuenta lo estimado de los aliados y si se suma un costo nuevo por mes. Nada se guarda.
 */
export function simular(
  base: ReadonlyArray<{ periodo: string; facturado: number; estimadoAliados: number }>,
  piso: number,
  opciones: { contarEstimado: boolean; costoExtra: number },
): Simulacion {
  const pisoMes = piso + Math.max(0, opciones.costoExtra);
  const meses = base.map((m) => {
    const total = round2(m.facturado + (opciones.contarEstimado ? m.estimadoAliados : 0));
    return { periodo: m.periodo, total, alcanza: total >= pisoMes, falta: round2(Math.max(0, pisoMes - total)) };
  });
  const total = round2(meses.reduce((s, m) => s + m.total, 0));
  const pisoDelPeriodo = round2(pisoMes * base.length);
  const diferencia = round2(total - pisoDelPeriodo);
  return { meses, total, pisoDelPeriodo, diferencia, faltaPorMes: diferencia >= 0 || base.length === 0 ? 0 : Math.ceil(-diferencia / base.length) };
}
