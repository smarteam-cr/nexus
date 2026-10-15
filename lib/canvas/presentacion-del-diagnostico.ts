/**
 * lib/canvas/presentacion-del-diagnostico.ts — LO PROPIO DEL DIAGNÓSTICO en la pregunta de cuándo se presenta. PURO.
 *
 * Desde el 2026-10-14 la pregunta es de los cuatro documentos que se presentan y vive en lib/presentaciones/reglas.ts
 * (una fila por respuesta, en `PresentacionDeDocumento`). Acá queda lo que solo hace el diagnóstico y las fechas que
 * usan los dos:
 *   · la fecha que lee Nexus en una reunión (`ADENDA_PRESENTACION_DEL_DIAGNOSTICO`, `leerPresentacionDetectada`): la
 *     lectura de cada reunión la pide si el diagnóstico todavía no se presentó;
 *   · el Json viejo de `Project.diagnosticoPresentacion` (DEPRECATED), que solo lee la migración
 *     (scripts/migrar-presentacion-del-diagnostico.ts).
 *
 * Las fechas son AAAA-MM-DD, el día de la presentación en Costa Rica; la cuenta de días se hace a mano, sin zonas
 * horarias.
 */

export interface ReunionDeLaPropuesta {
  id: string;
  titulo: string | null;
  /** AAAA-MM-DD de la reunión. */
  fecha: string;
}

/** DEPRECATED — el Json de `Project.diagnosticoPresentacion` (2026-10-07 al 2026-10-14). Solo lo lee la migración. */
export interface PresentacionDelDiagnostico {
  v: 1;
  /** La fecha que fijó una persona. */
  fecha: string | null;
  fijadaPor?: string;
  fijadaEn?: string;
  /** De dónde salió la fecha fijada, si salió de una reunión. */
  fuente?: string;
  /** «Todavía no sé»: la persona contestó, sin fecha. */
  sinFecha?: { por: string; en: string } | null;
  /** Lo que leyó Nexus en una reunión, esperando que alguien lo use o lo descarte. */
  propuesta?: { fecha: string; cita: string; reunion: ReunionDeLaPropuesta; en: string } | null;
  /** Fechas propuestas que alguien descartó: no se vuelven a proponer. */
  descartadas?: string[];
  /** Quién descartó cada fecha propuesta y cuándo (2026-10-09, lib/lo-propuesto: lo cuenta «Uso de Nexus»). */
  descartadasPor?: { fecha: string; por: string; en: string }[];
  /** Terminado y con la fecha reconfirmada. Si la fecha cambia después, se vuelve a pedir. */
  listo?: { fecha: string; por: string; en: string } | null;
  /** El último aviso al vendedor. */
  aviso?: { en: string; para: string | null; motivo: string | null } | null;
}

export const PRESENTACION_VACIA: PresentacionDelDiagnostico = { v: 1, fecha: null };

const AAAA_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export function esFecha(v: unknown): v is string {
  if (typeof v !== "string" || !AAAA_MM_DD.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const texto = (v: unknown, max = 400): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Lee lo guardado. Tolera null, basura o una versión vieja: devuelve algo usable. */
export function leerPresentacion(raw: unknown): PresentacionDelDiagnostico {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...PRESENTACION_VACIA };
  const o = raw as Record<string, unknown>;
  const p: PresentacionDelDiagnostico = { v: 1, fecha: esFecha(o.fecha) ? o.fecha : null };
  if (texto(o.fijadaPor)) p.fijadaPor = texto(o.fijadaPor);
  if (texto(o.fijadaEn)) p.fijadaEn = texto(o.fijadaEn);
  if (texto(o.fuente)) p.fuente = texto(o.fuente, 600);
  const sf = o.sinFecha as Record<string, unknown> | null | undefined;
  if (sf && texto(sf.por) && texto(sf.en)) p.sinFecha = { por: texto(sf.por), en: texto(sf.en) };
  const pr = o.propuesta as Record<string, unknown> | null | undefined;
  const re = pr?.reunion as Record<string, unknown> | undefined;
  if (pr && esFecha(pr.fecha) && texto(pr.cita) && re && texto(re.id) && esFecha(re.fecha)) {
    p.propuesta = {
      fecha: pr.fecha,
      cita: texto(pr.cita, 600),
      reunion: { id: texto(re.id), titulo: texto(re.titulo, 200) || null, fecha: re.fecha as string },
      en: texto(pr.en),
    };
  }
  if (Array.isArray(o.descartadas)) p.descartadas = o.descartadas.filter(esFecha).slice(-20);
  if (Array.isArray(o.descartadasPor)) {
    const dp = o.descartadasPor
      .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : null))
      .filter((x): x is Record<string, unknown> => !!x && esFecha(x.fecha) && !!texto(x.por) && !!texto(x.en))
      .map((x) => ({ fecha: x.fecha as string, por: texto(x.por), en: texto(x.en) }))
      .slice(-20);
    if (dp.length) p.descartadasPor = dp;
  }
  const li = o.listo as Record<string, unknown> | null | undefined;
  if (li && esFecha(li.fecha) && texto(li.por) && texto(li.en)) p.listo = { fecha: li.fecha, por: texto(li.por), en: texto(li.en) };
  const av = o.aviso as Record<string, unknown> | null | undefined;
  if (av && texto(av.en)) p.aviso = { en: texto(av.en), para: texto(av.para) || null, motivo: texto(av.motivo) || null };
  return p;
}

/** Días de `desde` a `hasta` (AAAA-MM-DD). */
export function diasEntre(desde: string, hasta: string): number {
  const t = (s: string) => {
    const [a, m, d] = s.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((t(hasta) - t(desde)) / 86_400_000);
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «jueves 10 de octubre». */
export function fechaEnPalabras(fecha: string): string {
  if (!esFecha(fecha)) return fecha;
  const [a, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return `${DIAS[t.getUTCDay()]} ${d} de ${MESES[m - 1]}`;
}

/** Hoy en Costa Rica (UTC-6, sin horario de verano), AAAA-MM-DD. */
export function hoyEnCostaRica(ahora: Date): string {
  return new Date(ahora.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
}

/** Lo que devuelve el modelo de la lectura de la reunión, validado. La cita se verifica aparte. */
export function leerPresentacionDetectada(raw: unknown, fechaDeLaReunion: string): { fecha: string; cita: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fecha = texto(o.fecha, 10);
  const cita = texto(o.cita, 600);
  if (!esFecha(fecha) || !cita) return null;
  // Una presentación es después de la reunión que la acordó, y no a más de cuatro meses.
  const dias = diasEntre(fechaDeLaReunion, fecha);
  if (dias < 0 || dias > 120) return null;
  return { fecha, cita };
}

export const ADENDA_PRESENTACION_DEL_DIAGNOSTICO = `

ADEMÁS: este proyecto tiene un DIAGNÓSTICO que todavía no se le presentó al cliente. Si en la reunión se acordó o se mencionó CUÁNDO se le va a presentar, agrega a tu JSON:
"presentacionDiagnostico": { "fecha": "<AAAA-MM-DD calculada desde la fecha de la reunión>", "cita": "<la frase TEXTUAL de la reunión que lo dice, sin cambiarle una palabra>" }
  - Un plan cuenta: «el diagnóstico se los presento el jueves», «la próxima sesión vemos el diagnóstico».
  - Calcula la fecha con el calendario: si la reunión fue el jueves 1 de octubre y dicen «el jueves», es el jueves 8 de octubre.
  - Si no se habló de cuándo se presenta el diagnóstico, NO pongas la clave. No inventes.`;
