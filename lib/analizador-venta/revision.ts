/**
 * lib/analizador-venta/revision.ts — LA AUTOEVALUACIÓN DE CADA SESIÓN (S4, 2026-10-27; docs/analizador-reuniones-venta-plan.md
 * › «El rediseño de Elías (2026-10-26)»). PURO y client-safe.
 *
 * El análisis de una reunión (S3) es una PROPUESTA de coaching. En la preventa, en «Cómo trabajaste esta sesión»
 * (Exploración › la sesión › Análisis), una persona lo confirma. Nada cuenta como evaluación sin esa confirmación: la
 * tendencia de cada vendedor (S7) solo suma lo confirmado. Es feedback de cómo se trabajó ESA sesión, no la planificación
 * de la que sigue (Elías, 27 oct: se fueron los comentarios del vendedor, el siguiente paso y «para la próxima»).
 *
 * Acá vive, una sola vez:
 *   · lo que el análisis dice de UNA sesión, resumido (`loDeLaSesion`): qué se exploró, qué quedó tocado o sin explorar,
 *     qué etapa se saltó, el siguiente paso y las recomendaciones;
 *   · lo que falta explorar, solo en el área a la que fueron las preguntas, en lista; del resto, el nombre del área
 *     (`loQueFaltaExplorar`, Elías 29 oct: mostrar todas las dimensiones de todos los departamentos era basura visual);
 *   · si el siguiente paso tuvo continuidad (`continuidadDelSiguientePaso`), sin IA: hubo otra reunión de venta con la
 *     empresa en los días que siguieron. Lo usa la pieza «Análisis» del prospecto (S5), no la sesión.
 */
import { EQUIPOS, type ClaveDeEquipo } from "@/lib/exploraciones/equipos";
import {
  paraComparar,
  separarArea,
  type Cita,
  type Decision,
  type EnfoqueDeLaSesion,
  type FilaDeNumeros,
  type Juicio,
  type Observacion,
  type PreguntaDelDemo,
  type PuntoJuzgado,
  type ResultadoDelAnalisis,
} from "./analisis";
import { PROCESO_CONSULTIVO, type EtapaDelProceso } from "./criterio";

/** Lo más largo que puede ser la nota de quien confirma. */
export const MAX_LETRAS_DE_LA_NOTA = 1000;

/* ── Lo que el análisis dice de UNA sesión ─────────────────────────────────────── */

export interface LoDeLaSesion {
  resumen: string;
  consultiva: Juicio | null;
  posicion: Juicio | null;
  /** Las dimensiones (o temas del equipo) que se exploraron a fondo. */
  exploradas: string[];
  /** Las áreas de lo que se exploró a fondo (las que se saben). */
  areasExploradas: string[];
  /** Se mencionaron y no se profundizó: con la cita del momento. */
  tocadas: { dimension: string; area: string | null; lectura: string; citas: Cita[] }[];
  /** No se tocaron (por ausencia: no hay cita). */
  sinExplorar: { dimension: string; area: string | null; lectura: string }[];
  /** Las etapas del proceso consultivo que se saltaron o se hicieron en parte. */
  etapasFlojas: { etapa: EtapaDelProceso; nombre: string; valor: string; lectura: string; citas: Cita[] }[];
  siguientePaso: Juicio | null;
  /** Aterrizar y expandir: si se exploró a fondo el dolor del área, y si ya hay base para un caso de uso. */
  dolor: Juicio | null;
  casoDeUso: Juicio | null;
  bien: Observacion[];
  /** ¿Se averiguó el resultado que busca? (2026-11-06). null en los análisis de antes. */
  resultado: Juicio | null;
  recomendaciones: ResultadoDelAnalisis["recomendaciones"];
  enfoque: EnfoqueDeLaSesion | null;
  /* 2026-11-08 (Elías, con Centauro). Vacíos en los análisis de antes; `decision` null (no se sabe, no «no falta nada»). */
  fueraDelObjetivo: Observacion[];
  numeros: FilaDeNumeros[];
  decision: Decision[] | null;
  demo: PreguntaDelDemo[];
}

/** El nombre de la dimensión sin el área, y el área: la del juicio o, en los de antes del 29 oct, la del paréntesis. */
function dimensionYArea(j: Juicio): { dimension: string; area: string | null } {
  const s = separarArea(j.dimension!);
  return { dimension: s.nombre, area: j.area ?? s.area };
}

export function loDeLaSesion(r: ResultadoDelAnalisis): LoDeLaSesion {
  const de = (p: PuntoJuzgado) => r.juicios.filter((j) => j.punto === p);
  const exploracion = de("exploracion").filter((j) => j.dimension);
  const etapas = de("etapa");
  return {
    resumen: r.resumen,
    consultiva: de("consultiva")[0] ?? null,
    posicion: de("posicion")[0] ?? null,
    exploradas: exploracion.filter((j) => j.valor === "explorado").map((j) => dimensionYArea(j).dimension),
    areasExploradas: [...new Set(exploracion.filter((j) => j.valor === "explorado").map((j) => dimensionYArea(j).area).filter((a): a is string => !!a))],
    tocadas: exploracion.filter((j) => j.valor === "tocado").map((j) => ({ ...dimensionYArea(j), lectura: j.lectura, citas: j.citas })),
    sinExplorar: exploracion.filter((j) => j.valor === "sin_explorar").map((j) => ({ ...dimensionYArea(j), lectura: j.lectura })),
    etapasFlojas: PROCESO_CONSULTIVO.flatMap((e) =>
      etapas
        .filter((j) => j.etapa === e.id && (j.valor === "se_salto" || j.valor === "en_parte"))
        .map((j) => ({ etapa: e.id, nombre: e.nombre, valor: j.valor!, lectura: j.lectura, citas: j.citas })),
    ),
    siguientePaso: de("siguiente_paso")[0] ?? null,
    dolor: de("dolor")[0] ?? null,
    casoDeUso: de("caso_de_uso")[0] ?? null,
    bien: r.bien ?? [],
    resultado: de("resultado")[0] ?? null,
    recomendaciones: r.recomendaciones,
    enfoque: r.enfoque ?? null,
    fueraDelObjetivo: r.fueraDelObjetivo ?? [],
    numeros: r.numeros ?? [],
    decision: r.decision?.length ? r.decision : null,
    demo: r.demo ?? [],
  };
}

/* ── Lo que falta explorar, en el área de la sesión ─────────────────────────────── */

export interface FaltaExplorar {
  dimension: string;
  /** El área (o el equipo) de la dimensión; null si no se reconoce. */
  area: string | null;
  estado: "tocado" | "sin_explorar";
  lectura: string;
  /** La cita del momento en que se tocó (lo no tocado no la tiene: no pasó). */
  cita: Cita | null;
}

/**
 * De qué equipo es una dimensión, por su nombre (el modelo la nombra como se la pasó el material): primero los temas del
 * equipo de la sesión, después las dimensiones de la escala (con su nombre de la edición o el general). Un equipo con área
 * en la escala se nombra como su área («Servicio», no «Servicio al cliente»): si no, el mismo equipo saldría en dos grupos.
 * Los análisis de antes del 29 oct que no traen el área la sacan de acá.
 */
export function equipoDeLaDimension(
  dimension: string,
  o: {
    equipo: ClaveDeEquipo | null | undefined;
    areas: readonly { id: string; nombre: string; dimensiones: readonly { nombre: string; nombreGeneral?: string | null }[] }[];
  },
): string | null {
  const k = paraComparar(dimension);
  const eq = o.equipo ? EQUIPOS[o.equipo] : null;
  const nombreDelEquipo = eq ? (o.areas.find((a) => a.id === eq.area)?.nombre ?? eq.nombre) : null;
  if (eq?.temas.some((t) => paraComparar(t.nombre) === k)) return nombreDelEquipo;
  const area = o.areas.find((a) => a.dimensiones.some((d) => paraComparar(d.nombre) === k || (!!d.nombreGeneral && paraComparar(d.nombreGeneral) === k)));
  return area?.nombre ?? nombreDelEquipo;
}

export interface LoQueFaltaExplorar {
  /** Las áreas a las que fueron las preguntas; vacío si no se sabe (entonces no se filtra nada). */
  foco: string[];
  /** De esas áreas, lo que se tocó sin profundizar (primero) y lo que no se tocó. */
  items: FaltaExplorar[];
  /** Las áreas que se esperaban y a las que la conversación no fue: una línea, sin sus dimensiones. */
  sinTocar: string[];
}

/**
 * Lo que falta explorar, enfocado en el área de la sesión (Elías, 29 oct). El foco es el que dejó el análisis
 * (`enfoque`); en los de antes, las áreas donde algo se exploró o se tocó con cita. De las demás áreas solo queda el
 * nombre. Una dimensión juzgada dos veces sale una sola vez (gana «se tocó»: hay una cita).
 */
export function loQueFaltaExplorar(
  lo: Pick<LoDeLaSesion, "exploradas" | "tocadas" | "sinExplorar" | "areasExploradas" | "enfoque">,
  areaDe: (dimension: string) => string | null,
): LoQueFaltaExplorar {
  const todas: FaltaExplorar[] = [
    ...lo.tocadas.map((t) => ({ dimension: t.dimension, area: t.area ?? areaDe(t.dimension), estado: "tocado" as const, lectura: t.lectura, cita: t.citas[0] ?? null })),
    ...lo.sinExplorar.map((t) => ({ dimension: t.dimension, area: t.area ?? areaDe(t.dimension), estado: "sin_explorar" as const, lectura: t.lectura, cita: null })),
  ];
  const vistas = new Set<string>();
  const unicas = todas.filter((f) => {
    const k = `${paraComparar(f.dimension)}|${paraComparar(f.area ?? "")}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  // Lo explorado a fondo también dice adónde fue la conversación: sin esto, un análisis viejo sin el área en el nombre
  // decía «Se exploró a fondo: Proceso de venta» y a la vez «No se tocó en esta sesión: Ventas».
  const exploradasEn = lo.exploradas.map(areaDe).filter((a): a is string => !!a);
  const conCita = [...lo.areasExploradas, ...exploradasEn, ...unicas.filter((f) => f.estado === "tocado" && f.area).map((f) => f.area!)];
  const foco = lo.enfoque?.areas.length ? lo.enfoque.areas : [...new Set(conCita)];
  const enFoco = (a: string | null) => !foco.length || !a || foco.some((x) => paraComparar(x) === paraComparar(a));
  const sinTocar = lo.enfoque ? lo.enfoque.sinTocar : [...new Set(unicas.filter((f) => !enFoco(f.area)).map((f) => f.area!))];
  return { foco, items: unicas.filter((f) => enFoco(f.area)), sinTocar };
}

/* ── Si el siguiente paso tuvo continuidad ─────────────────────────────────────── */

/** Cuántos días después de la reunión se espera la siguiente para decir que hubo continuidad. */
export const DIAS_PARA_LA_CONTINUIDAD = 21;
const DIA_MS = 86_400_000;

export type Continuidad =
  | { tipo: "sin_paso" }
  | { tipo: "hubo"; fecha: string; dias: number }
  | { tipo: "tarde"; fecha: string; dias: number }
  | { tipo: "no_hubo" }
  | { tipo: "pendiente" };

/**
 * ¿El siguiente paso acordado tuvo continuidad? Sin IA y sin adivinar qué se cumplió: si quedó un siguiente paso (con o
 * sin fecha), se mira si hubo otra reunión de venta con la empresa en los `DIAS_PARA_LA_CONTINUIDAD` días que siguieron.
 * `despues`: las fechas (ISO) de las reuniones de venta de la MISMA empresa, cualquiera.
 */
export function continuidadDelSiguientePaso(o: { siguientePaso: Pick<Juicio, "valor"> | null; fecha: string; despues: readonly string[]; ahora: Date }): Continuidad {
  if (!o.siguientePaso || o.siguientePaso.valor === "ninguno") return { tipo: "sin_paso" };
  const desde = Date.parse(o.fecha);
  const siguiente = o.despues.map((f) => Date.parse(f)).filter((t) => t > desde).sort((a, b) => a - b)[0];
  if (siguiente !== undefined) {
    const dias = Math.round((siguiente - desde) / DIA_MS);
    const fecha = new Date(siguiente).toISOString();
    return dias <= DIAS_PARA_LA_CONTINUIDAD ? { tipo: "hubo", fecha, dias } : { tipo: "tarde", fecha, dias };
  }
  return +o.ahora - desde > DIAS_PARA_LA_CONTINUIDAD * DIA_MS ? { tipo: "no_hubo" } : { tipo: "pendiente" };
}

/** ¿El siguiente paso quedó con fecha? (con fecha y dueño, o con fecha sin dueño). */
export function siguientePasoConFecha(j: Pick<Juicio, "valor"> | null): boolean {
  return j?.valor === "con_fecha_y_duenio" || j?.valor === "sin_duenio";
}
