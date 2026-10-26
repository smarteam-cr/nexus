/**
 * lib/analizador-venta/revision.ts — LA AUTOEVALUACIÓN DE CADA SESIÓN (S4, 2026-10-27; docs/analizador-reuniones-venta-plan.md
 * › «El rediseño de Elías (2026-10-26)»). PURO y client-safe.
 *
 * El análisis de una reunión (S3) es una PROPUESTA de coaching. En la preventa, en «Cómo trabajaste esta sesión»
 * (Exploración › la sesión › Análisis), el vendedor lo comenta o discrepa, y una persona lo confirma. Nada cuenta como
 * evaluación sin esa confirmación: la tendencia de cada vendedor (S7) solo suma lo confirmado, y lo que se confirmó «para
 * la próxima» es lo que se ofrece llevar a la guía de la siguiente sesión (por el mismo camino que «Quedó abierto»).
 *
 * Acá vive, una sola vez:
 *   · el comentario y su forma guardada (`AnalisisDeVenta.comentarios`), leída tolerante;
 *   · lo que el análisis dice de UNA sesión, resumido (`loDeLaSesion`): qué se exploró, qué quedó tocado o sin explorar,
 *     qué etapa se saltó, el siguiente paso y las recomendaciones;
 *   · lo que se puede llevar a la próxima sesión (`candidatasParaLaProxima`);
 *   · si el siguiente paso tuvo continuidad (`continuidadDelSiguientePaso`), sin IA: hubo otra reunión de venta con la
 *     empresa en los días que siguieron.
 */
import { PUNTOS_JUZGADOS, type Cita, type Juicio, type PuntoJuzgado, type ResultadoDelAnalisis } from "./analisis";
import { PROCESO_CONSULTIVO, type EtapaDelProceso } from "./criterio";

/* ── Los comentarios ───────────────────────────────────────────────────────────── */

export const TIPOS_DE_COMENTARIO = ["comenta", "discrepa"] as const;
export type TipoDeComentario = (typeof TIPOS_DE_COMENTARIO)[number];

/** Sobre qué punto del análisis es el comentario; null = sobre el análisis entero. */
export type PuntoDelComentario = PuntoJuzgado | "recomendaciones" | null;

export interface ComentarioDelAnalisis {
  id: string;
  /** El correo de quien comentó. */
  por: string;
  tipo: TipoDeComentario;
  punto: PuntoDelComentario;
  texto: string;
  /** ISO. Si es anterior a `analizadoAt`, habla de un análisis anterior. */
  en: string;
}

export const MAX_COMENTARIOS = 60;
export const MAX_LETRAS_DEL_COMENTARIO = 1000;
export const MAX_PARA_LA_PROXIMA = 6;
export const MAX_LETRAS_PARA_LA_PROXIMA = 300;

export const PUNTOS_DEL_COMENTARIO = [...PUNTOS_JUZGADOS, "recomendaciones"] as const;

/** Los comentarios guardados, leídos tolerante: lo que no tiene forma se deja afuera. */
export function leerComentarios(v: unknown): ComentarioDelAnalisis[] {
  if (!Array.isArray(v)) return [];
  const out: ComentarioDelAnalisis[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const c = x as Record<string, unknown>;
    if (typeof c.id !== "string" || typeof c.por !== "string" || typeof c.texto !== "string" || typeof c.en !== "string") continue;
    if (!(TIPOS_DE_COMENTARIO as readonly string[]).includes(c.tipo as string)) continue;
    const punto = (PUNTOS_DEL_COMENTARIO as readonly string[]).includes(c.punto as string) ? (c.punto as PuntoDelComentario) : null;
    out.push({ id: c.id, por: c.por, tipo: c.tipo as TipoDeComentario, punto, texto: c.texto, en: c.en });
  }
  return out;
}

/** Lo confirmado para la próxima sesión, leído tolerante. */
export function leerParaLaProxima(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, MAX_PARA_LA_PROXIMA) : [];
}

/** Suma un comentario a la lista (el más nuevo al final). Si ya hay demasiados, se van los más viejos. */
export function sumarComentario(lista: readonly ComentarioDelAnalisis[], nuevo: ComentarioDelAnalisis): ComentarioDelAnalisis[] {
  return [...lista, nuevo].slice(-MAX_COMENTARIOS);
}

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

/**
 * Lo que se puede llevar a la próxima sesión: las recomendaciones primero, después lo que quedó sin explorar y lo que solo
 * se tocó. Sin repetir. La persona elige cuáles confirma.
 */
export function candidatasParaLaProxima(r: ResultadoDelAnalisis): string[] {
  const s = loDeLaSesion(r);
  const out = [
    ...s.recomendaciones.map((x) => x.texto),
    ...s.sinExplorar.map((x) => `Explorar ${x.dimension}: quedó sin tocar.`),
    ...s.tocadas.map((x) => `Profundizar en ${x.dimension}: se mencionó y no se exploró a fondo.`),
  ].map((t) => t.trim().slice(0, MAX_LETRAS_PARA_LA_PROXIMA));
  return [...new Set(out.filter(Boolean))];
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
