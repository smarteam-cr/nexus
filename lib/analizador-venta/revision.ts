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
 *   · lo que faltó explorar, con el equipo de cada dimensión y agrupado por equipo (`loQueFaltoPorEquipo`);
 *   · si el siguiente paso tuvo continuidad (`continuidadDelSiguientePaso`), sin IA: hubo otra reunión de venta con la
 *     empresa en los días que siguieron. Lo usa la pieza «Análisis» del prospecto (S5), no la sesión.
 */
import { EQUIPOS, type ClaveDeEquipo } from "@/lib/exploraciones/equipos";
import { paraComparar, type Cita, type Juicio, type PuntoJuzgado, type ResultadoDelAnalisis } from "./analisis";
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
  /** Se mencionaron y no se profundizó: con la cita del momento. */
  tocadas: { dimension: string; lectura: string; citas: Cita[] }[];
  /** No se tocaron (por ausencia: no hay cita). */
  sinExplorar: { dimension: string; lectura: string }[];
  /** Las etapas del proceso consultivo que se saltaron o se hicieron en parte. */
  etapasFlojas: { etapa: EtapaDelProceso; nombre: string; valor: string; lectura: string; citas: Cita[] }[];
  siguientePaso: Juicio | null;
  recomendaciones: ResultadoDelAnalisis["recomendaciones"];
}

export function loDeLaSesion(r: ResultadoDelAnalisis): LoDeLaSesion {
  const de = (p: PuntoJuzgado) => r.juicios.filter((j) => j.punto === p);
  const exploracion = de("exploracion").filter((j) => j.dimension);
  const etapas = de("etapa");
  return {
    resumen: r.resumen,
    consultiva: de("consultiva")[0] ?? null,
    posicion: de("posicion")[0] ?? null,
    exploradas: exploracion.filter((j) => j.valor === "explorado").map((j) => j.dimension!),
    tocadas: exploracion.filter((j) => j.valor === "tocado").map((j) => ({ dimension: j.dimension!, lectura: j.lectura, citas: j.citas })),
    sinExplorar: exploracion.filter((j) => j.valor === "sin_explorar").map((j) => ({ dimension: j.dimension!, lectura: j.lectura })),
    etapasFlojas: PROCESO_CONSULTIVO.flatMap((e) =>
      etapas
        .filter((j) => j.etapa === e.id && (j.valor === "se_salto" || j.valor === "en_parte"))
        .map((j) => ({ etapa: e.id, nombre: e.nombre, valor: j.valor!, lectura: j.lectura, citas: j.citas })),
    ),
    siguientePaso: de("siguiente_paso")[0] ?? null,
    recomendaciones: r.recomendaciones,
  };
}

/* ── Lo que faltó explorar, por equipo ─────────────────────────────────────────── */

export interface FaltaExplorar {
  dimension: string;
  /** El equipo (o el área de la escala) de la dimensión; null si no se reconoce. */
  equipo: string | null;
  estado: "tocado" | "sin_explorar";
  lectura: string;
  /** La cita del momento en que se tocó (lo no tocado no la tiene: no pasó). */
  cita: Cita | null;
}

/**
 * De qué equipo es una dimensión, por su nombre (el modelo la nombra como se la pasó el material): primero los temas del
 * equipo de la sesión, después las dimensiones de la escala (con su nombre de la edición o el general). Un equipo con área
 * en la escala se nombra como su área («Servicio», no «Servicio al cliente»): si no, el mismo equipo saldría en dos grupos.
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

/**
 * Lo que faltó explorar, agrupado por equipo en el orden en que aparece; en cada grupo, lo que se tocó va primero. Una
 * dimensión juzgada dos veces sale una sola vez (gana «se tocó»: hay una cita).
 */
export function loQueFaltoPorEquipo(lo: Pick<LoDeLaSesion, "tocadas" | "sinExplorar">, equipoDe: (dimension: string) => string | null): { equipo: string | null; items: FaltaExplorar[] }[] {
  const todas: FaltaExplorar[] = [
    ...lo.tocadas.map((t) => ({ dimension: t.dimension, equipo: equipoDe(t.dimension), estado: "tocado" as const, lectura: t.lectura, cita: t.citas[0] ?? null })),
    ...lo.sinExplorar.map((t) => ({ dimension: t.dimension, equipo: equipoDe(t.dimension), estado: "sin_explorar" as const, lectura: t.lectura, cita: null })),
  ];
  const vistas = new Set<string>();
  const grupos = new Map<string | null, FaltaExplorar[]>();
  for (const f of todas) {
    const k = paraComparar(f.dimension);
    if (vistas.has(k)) continue;
    vistas.add(k);
    grupos.set(f.equipo, [...(grupos.get(f.equipo) ?? []), f]);
  }
  return [...grupos].map(([equipo, items]) => ({ equipo, items }));
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
