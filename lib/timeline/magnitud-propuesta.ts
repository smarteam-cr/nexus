/**
 * lib/timeline/magnitud-propuesta.ts — ¿CUÁN DISTINTA ES ESTA PROPUESTA?
 * Puro y client-safe. Lo consume la franja de la propuesta en el Gantt.
 *
 * ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
 * Cuando un handoff se regenera con más contexto, el agente puede proponer OTRA descomposición
 * del proyecto — no un ajuste, un plan distinto. Pero el CSE veía exactamente lo mismo que ante
 * un cambio menor: una lista de sugerencias sueltas, cada una con su ✓/✗. Nada decía «esto es
 * prácticamente un cronograma nuevo».
 *
 * ── POR QUÉ `deltas.length` ES CIEGO ─────────────────────────────────────────
 * La reconciliación del handoff (analyze/route.ts) matchea las fases propuestas contra las
 * existentes por NOMBRE y, si falla, POR POSICIÓN. Así que un cronograma rehecho NO llega como
 * «N fases nuevas + N borradas» —eso ni siquiera es representable: el modelo es ADITIVO y no
 * existe delta de borrado— sino como N MODIFY_PHASE con `name` y `durationWeeks` cambiados. La
 * fase 3 propuesta se pega al id de la fase 3 existente aunque se llame otra cosa. Contar
 * deltas no distingue «cinco fases se llaman distinto» de «cinco fases movieron un día».
 *
 * Por eso las señales miran justo lo que esa reconciliación produce: cuántas fases cambian de
 * NOMBRE, cuántas de DURACIÓN, cuántas se suman, y cuánto se mueve el calendario.
 *
 * ── POR QUÉ ARCHIVO APARTE ───────────────────────────────────────────────────
 * `proposal-deltas.ts` deliberadamente NO importa `weeks.ts` y lo consume la ruta que aplica los
 * cambios. La magnitud necesita calendario y solo la usa la pantalla: mezclarlas le agregaría
 * dependencia de fechas al código que corre en el servidor sin necesitarla.
 */
import {
  computeProposalDeltas,
  anchorAfterDeltas,
  phasesAfterDeltas,
  type CurrentPhaseLike,
  type ProposalLike,
  type ProposalDelta,
} from "./proposal-deltas";
import { projectedEnd, endShiftDays, plural, type ProjectedEnd } from "./weeks";

/* ── LOS UMBRALES ──────────────────────────────────────────────────────────────
   Exportados con nombre a propósito: ajustarlos mirando datos reales es tocar tres números
   con la tabla de tests al lado, sin tocar una línea de UI. */

/** Menos de 2 fases afectadas NUNCA es «masivo», aunque sean el 100% de un cronograma de 1. */
export const MITAD_MINIMA = 2;
/** Cuánto tiene que estirarse o encogerse el calendario para que sea noticia. */
export const SALTO_SPAN_RELATIVO = 0.3;
/** Piso absoluto en semanas: evita disparar por redondeo en cronogramas cortos. */
export const SALTO_SPAN_MINIMO = 2;

export interface MagnitudPropuesta {
  /** Denominador de todas las reglas: las fases que el proyecto tiene HOY. */
  fasesActuales: number;
  fasesRenombradas: number;
  fasesConDuracionDistinta: number;
  fasesNuevas: number;
  reordena: boolean;
  mueveArranque: boolean;

  spanAntes: number;
  spanDespues: number;
  /** Semanas de calendario que se estira (+) o encoge (−) el plan. */
  semanasDeCorrimiento: number;

  finAntes: ProjectedEnd;
  finDespues: ProjectedEnd;
  /** Días que se movería el cierre si se aceptara todo. null si falta alguna fecha. */
  diasDeCorrimientoFin: number | null;

  /** Las señales que dispararon, YA redactadas — una por bullet. */
  motivos: string[];
  esCronogramaNuevo: boolean;
}

/** ¿Cuántas fases con `MODIFY_PHASE` tocan este campo? */
function cuentaPorCampo(deltas: ProposalDelta[], campo: "name" | "durationWeeks"): number {
  return deltas.filter((d) => d.kind === "MODIFY_PHASE" && d.changes.some((c) => c.field === campo))
    .length;
}

/**
 * Mide cuán distinta es la propuesta y adónde caería el cierre si se aceptara ENTERA.
 * No escribe nada: proyecta con las mismas funciones que usa el endpoint al aplicar.
 */
export function medirPropuesta(
  actuales: CurrentPhaseLike[],
  propuesta: ProposalLike,
  anclaActual: string | null,
): MagnitudPropuesta {
  const deltas = computeProposalDeltas(actuales, propuesta, anclaActual);
  const todas = new Set(deltas.map((d) => d.key));

  const fasesActuales = actuales.length;
  const fasesRenombradas = cuentaPorCampo(deltas, "name");
  const fasesConDuracionDistinta = cuentaPorCampo(deltas, "durationWeeks");
  const fasesNuevas = deltas.filter((d) => d.kind === "ADD_PHASE").length;
  const reordena = deltas.some((d) => d.kind === "REORDER_PHASES");
  const mueveArranque = deltas.some((d) => d.kind === "SET_ANCHOR");

  /* El «antes» pasa por el MISMO camino que el «después» (con el set vacío) para que no pueda
     divergir de lo que el Gantt dibuja: si la proyección tuviera un error, lo tendría en los dos
     lados y el corrimiento seguiría siendo honesto. */
  const finAntes = projectedEnd(anclaActual, phasesAfterDeltas(actuales, propuesta, new Set()));
  const finDespues = projectedEnd(
    anchorAfterDeltas(anclaActual, propuesta, todas),
    phasesAfterDeltas(actuales, propuesta, todas),
  );
  const spanAntes = finAntes.spanWeeks;
  const spanDespues = finDespues.spanWeeks;
  const semanasDeCorrimiento = spanDespues - spanAntes;

  const esMitad = (k: number) => k >= MITAD_MINIMA && k * 2 >= fasesActuales;
  const umbralSpan = Math.max(SALTO_SPAN_MINIMO, Math.ceil(spanAntes * SALTO_SPAN_RELATIVO));

  const motivos: string[] = [];
  if (esMitad(fasesRenombradas)) {
    motivos.push(`Cambian de nombre ${fasesRenombradas} de las ${fasesActuales} fases.`);
  }
  if (esMitad(fasesConDuracionDistinta)) {
    motivos.push(`Cambian de duración ${fasesConDuracionDistinta} de las ${fasesActuales} fases.`);
  }
  if (esMitad(fasesNuevas)) {
    motivos.push(
      `Suma ${plural(fasesNuevas, "fase nueva", "fases nuevas")} a las ${fasesActuales} actuales.`,
    );
  }
  if (Math.abs(semanasDeCorrimiento) >= umbralSpan) {
    motivos.push(
      `El cronograma pasa de ${plural(spanAntes, "semana", "semanas")} a ${plural(spanDespues, "semana", "semanas")}.`,
    );
  }

  /* DOS señales, no una: el caso real —más contexto, otra descomposición— las enciende juntas
     (renombres + duraciones + span). El falso positivo típico —una re-estimación honesta—
     enciende una sola, y un aviso que grita «cronograma nuevo» porque dos fases se movieron una
     semana se vuelve ruido y se aprende a ignorar.
     La excepción: renombrar dos tercios o más de las fases es, sin discusión, otra lista. */
  const renombreTotal = fasesRenombradas >= MITAD_MINIMA && fasesRenombradas * 3 >= fasesActuales * 2;
  const esCronogramaNuevo = motivos.length >= 2 || renombreTotal;

  return {
    fasesActuales,
    fasesRenombradas,
    fasesConDuracionDistinta,
    fasesNuevas,
    reordena,
    mueveArranque,
    spanAntes,
    spanDespues,
    semanasDeCorrimiento,
    finAntes,
    finDespues,
    diasDeCorrimientoFin: endShiftDays(finAntes, finDespues),
    motivos,
    esCronogramaNuevo,
  };
}

/** Une frases con comas y «y» antes de la última. Local a propósito: el de publish-diff
 *  capitaliza y agrega punto para su propio caso (precargar un textarea), y acá el fragmento
 *  va embebido en una oración más larga. */
function unirFrases(frases: string[]): string {
  if (frases.length === 0) return "";
  if (frases.length === 1) return frases[0];
  return `${frases.slice(0, -1).join(", ")} y ${frases[frases.length - 1]}`;
}

/**
 * «5 fases cambian de nombre, 4 cambian de duración y se suman 2 fases nuevas» — el resumen que
 * el confirm de «Reemplazar todo» pone antes de que alguien apriete.
 */
export function redactarResumenDeCambios(m: MagnitudPropuesta): string {
  const frases: string[] = [];
  if (m.fasesRenombradas > 0) {
    frases.push(`${plural(m.fasesRenombradas, "fase cambia", "fases cambian")} de nombre`);
  }
  if (m.fasesConDuracionDistinta > 0) {
    frases.push(`${plural(m.fasesConDuracionDistinta, "fase cambia", "fases cambian")} de duración`);
  }
  if (m.fasesNuevas > 0) {
    const verbo = m.fasesNuevas === 1 ? "suma" : "suman";
    frases.push(`se ${verbo} ${plural(m.fasesNuevas, "fase nueva", "fases nuevas")}`);
  }
  if (m.reordena) frases.push("se reordenan las fases");
  if (m.mueveArranque) frases.push("se mueve la fecha de arranque");
  return unirFrases(frases);
}
