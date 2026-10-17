/**
 * lib/google/drive-candidatos.ts — qué archivo de Drive es de ESTA reunión. PURO (sin red ni base).
 *
 * ── POR QUÉ EXISTE (medido en producción el 2026-10-05) ──────────────────────────────────────
 * Sin documento adjunto al evento, el enriquecimiento buscaba en el Drive del impersonado archivos
 * cuyo nombre contuviera las dos primeras palabras de 4+ letras del título y leía el MÁS NUEVO. Eso
 * tomaba el documento de otra reunión cada vez que el título tenía una palabra común:
 *   · «Recurrente - CAV» (Club de Amantes del Vino) → «FACO Recurrente» (Honda): «CAV» tiene 3 letras;
 *   · «ICB + Smarteam» → «CAYALÁ + SMARTEAM | CONVERSEMOS…»: la única palabra fue «Smarteam»;
 *   · y si el documento correcto no tenía transcripción, seguía con el siguiente archivo de la lista.
 * De las 169 reuniones que se llenaron así y nunca recibieron su documento, 101 tenían la
 * transcripción de otra reunión, 30 la de otro día de su serie y 25 un documento que ni siquiera era
 * de una reunión (contratos, briefs).
 *
 * ── LA REGLA ──────────────────────────────────────────────────────────────────────────────────
 * Google nombra los archivos de una reunión con su título y su fecha. Un archivo se acepta solo si:
 *   1. su nombre tiene una de esas formas (notas de Gemini, transcripción de Meet o notas del
 *      calendario) — un chat, un contrato o un documento suelto no es la reunión;
 *   2. el título del nombre es EL MISMO que el de la reunión (sin tildes ni signos; Gemini corta los
 *      títulos a 99 caracteres y eso también se acepta);
 *   3. su fecha cae dentro de la ventana y es la de ESTA reunión: si la misma serie tiene otra
 *      reunión más cerca de esa fecha (la diaria de ayer), el archivo es de esa otra.
 * Entre los aceptados van primero las notas de Gemini, después la transcripción de Meet y al final
 * las notas del calendario; dentro de cada clase, el más cercano a la fecha de la reunión.
 * Si ninguno sirve, la reunión queda sin texto: es mejor que el texto de otra.
 */

/** Lo que trae Drive de cada archivo. */
export interface ArchivoDeDrive {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string | null;
}

export type ClaseDeArchivo = "notas-gemini" | "transcripcion" | "notas-calendario";

/** El nombre de un archivo, leído. */
export interface NombreLeido {
  titulo: string;
  /** El instante que dice el nombre, en UTC; null si el nombre no trae hora o la zona no se conoce. */
  momento: Date | null;
  clase: ClaseDeArchivo;
}

export interface ReunionABuscar {
  titulo: string;
  fecha: Date;
  /** Otras reuniones con el MISMO título cerca de esta (las de una serie). */
  otrasFechas: readonly Date[];
}

export interface ArchivoElegido {
  archivo: ArchivoDeDrive;
  clase: ClaseDeArchivo;
  distanciaMs: number;
}

export interface Eleccion {
  /** Los archivos de esta reunión, en el orden en que conviene leerlos. */
  elegidos: ArchivoElegido[];
  /** Los que no, con el porqué (para el log). */
  descartados: { nombre: string; motivo: string }[];
}

/** Ventana alrededor de la fecha del evento. Un evento editado después de la reunión llega a correrse ~2 días. */
export const VENTANA_DRIVE_MS = 3 * 24 * 3_600_000;

/** Gemini corta el título de la reunión a 99 caracteres en el nombre del documento. */
const LARGO_DE_TITULO_CORTADO = 90;

// Zonas que aparecen en los nombres. «CST» es la de Costa Rica (UTC-6), igual que la central de EE.UU.
const ZONAS: Record<string, number> = {
  UTC: 0, GMT: 0, Z: 0,
  CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420, EST: -300, EDT: -240,
  COT: -300, PET: -300, ECT: -300, ART: -180, BRT: -180, UYT: -180,
};

/** Minutos de diferencia con UTC de una zona como «GMT-05:00», «GMT-5» o «CST»; null si no se conoce. */
export function desfaseDeZona(zona: string | undefined): number | null {
  if (!zona) return null;
  const z = zona.trim().toUpperCase();
  const m = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(z);
  if (m) {
    const minutos = Number(m[2]) * 60 + Number(m[3] ?? 0);
    return m[1] === "-" ? -minutos : minutos;
  }
  return z in ZONAS ? ZONAS[z] : null;
}

function instante(anio: string, mes: string, dia: string, hora: string, min: string, zona: string | undefined): Date | null {
  const desfase = desfaseDeZona(zona);
  if (desfase === null) return null;
  const utc = Date.UTC(Number(anio), Number(mes) - 1, Number(dia), Number(hora), Number(min)) - desfase * 60_000;
  return Number.isNaN(utc) ? null : new Date(utc);
}

const FECHA = String.raw`(\d{4})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2})(?: ([A-Za-z]{1,5}(?:[+-]\d{1,2}(?::?\d{2})?)?))?`;
// «Recurrente - CAV: 2026/09/30 10:54 GMT-03:00 - Notas de Gemini». El título va hasta el ÚLTIMO «: fecha».
const RE_GEMINI = new RegExp(String.raw`^(.*\S)\s*:\s*${FECHA} - (?:Notas de Gemini|Notes by Gemini|Notas do Gemini|Notas por Gemini)$`, "i");
// «Teamnet: Comenzando el camino web - 2026/08/28 10:00 GMT-05:00 - Transcript».
const RE_TRANSCRIPCION = new RegExp(String.raw`^(.*\S) - ${FECHA} - (?:Transcript|Transcripción|Transcripcion|Transcrição)$`, "i");
// «2026-10-01 - Recurrente Tecnica - CAV»: el documento de notas que se abre desde el evento.
const RE_NOTAS_CALENDARIO = /^(\d{4})-(\d{2})-(\d{2}) - (.+)$/;

/**
 * Lee el nombre de un archivo de Drive. null = no es un archivo de una reunión (un chat, un contrato,
 * «Documento sin título», las notas de una reunión instantánea sin título).
 */
export function leerNombreDeArchivo(nombre: string): NombreLeido | null {
  const n = nombre.trim();
  let m = RE_GEMINI.exec(n);
  if (m) return { titulo: m[1], momento: instante(m[2], m[3], m[4], m[5], m[6], m[7]), clase: "notas-gemini" };
  m = RE_TRANSCRIPCION.exec(n);
  if (m) return { titulo: m[1], momento: instante(m[2], m[3], m[4], m[5], m[6], m[7]), clase: "transcripcion" };
  m = RE_NOTAS_CALENDARIO.exec(n);
  if (m) return { titulo: m[4], momento: null, clase: "notas-calendario" };
  return null;
}

/** Un título comparable: sin tildes, sin signos ni emojis, en minúsculas y con un espacio entre palabras. */
export function tituloComparable(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** ¿Es el mismo título? Exacto (sin tildes ni signos), o el del archivo es el de la reunión cortado por Gemini. */
export function mismoTitulo(deLaReunion: string, delArchivo: string): boolean {
  const a = tituloComparable(deLaReunion);
  const b = tituloComparable(delArchivo);
  if (!a || !b) return false;
  if (a === b) return true;
  return delArchivo.trim().length >= LARGO_DE_TITULO_CORTADO && a.startsWith(b);
}

const PRIORIDAD: Record<ClaseDeArchivo, number> = { "notas-gemini": 0, transcripcion: 1, "notas-calendario": 2 };

function fechaCorta(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Los archivos de Drive que son de esta reunión, en el orden en que conviene leerlos. */
export function elegirArchivosDeLaReunion(
  reunion: ReunionABuscar,
  archivos: readonly ArchivoDeDrive[],
  ventanaMs: number = VENTANA_DRIVE_MS,
): Eleccion {
  const elegidos: ArchivoElegido[] = [];
  const descartados: Eleccion["descartados"] = [];
  const fecha = reunion.fecha.getTime();
  for (const archivo of archivos) {
    const leido = leerNombreDeArchivo(archivo.name);
    if (!leido) {
      descartados.push({ nombre: archivo.name, motivo: "no es un archivo de una reunión" });
      continue;
    }
    if (!mismoTitulo(reunion.titulo, leido.titulo)) {
      descartados.push({ nombre: archivo.name, motivo: "es de otra reunión (otro título)" });
      continue;
    }
    // La hora del nombre manda; si no la trae (o la zona no se conoce), cuándo se creó el archivo.
    const creado = archivo.createdTime ? Date.parse(archivo.createdTime) : NaN;
    const momento = leido.momento?.getTime() ?? (Number.isNaN(creado) ? null : creado);
    if (momento === null) {
      descartados.push({ nombre: archivo.name, motivo: "no se sabe de cuándo es" });
      continue;
    }
    const distanciaMs = Math.abs(momento - fecha);
    if (distanciaMs > ventanaMs) {
      descartados.push({ nombre: archivo.name, motivo: "es de otra fecha" });
      continue;
    }
    const masCercana = reunion.otrasFechas.find((otra) => Math.abs(momento - otra.getTime()) < distanciaMs);
    if (masCercana) {
      descartados.push({ nombre: archivo.name, motivo: `es de la reunión del ${fechaCorta(masCercana)} (misma serie)` });
      continue;
    }
    elegidos.push({ archivo, clase: leido.clase, distanciaMs });
  }
  elegidos.sort((x, y) => PRIORIDAD[x.clase] - PRIORIDAD[y.clase] || x.distanciaMs - y.distanciaMs);
  return { elegidos, descartados };
}

/** Las palabras del título con las que se le pide a Drive (sin signos; Drive las compara por inicio de palabra). */
export function palabrasParaBuscar(titulo: string, max = 2): string[] {
  const palabras = titulo
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && /\p{L}/u.test(w));
  const unicas = [...new Map(palabras.map((w) => [w.toLowerCase(), w])).values()];
  // Las más largas son las que menos archivos ajenos traen. El filtro de verdad es `elegirArchivosDeLaReunion`.
  return unicas.sort((a, b) => b.length - a.length).slice(0, max);
}

/**
 * La consulta a Drive: documentos y textos CREADOS dentro de la ventana cuyo nombre tenga las palabras
 * del título. Por creación y no por modificación: unas notas que alguien editó una semana después
 * siguen siendo de la reunión. null = el título no tiene con qué buscar.
 */
export function consultaDeDrive(titulo: string, fecha: Date, ventanaMs: number = VENTANA_DRIVE_MS): string | null {
  const palabras = palabrasParaBuscar(titulo);
  if (palabras.length === 0) return null;
  const desde = new Date(fecha.getTime() - ventanaMs).toISOString();
  const hasta = new Date(fecha.getTime() + ventanaMs).toISOString();
  const nombre = palabras.map((p) => `name contains '${p.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`).join(" and ");
  return [
    `(mimeType='application/vnd.google-apps.document' or mimeType='text/vtt' or mimeType='text/plain')`,
    `and ${nombre}`,
    `and createdTime >= '${desde}'`,
    `and createdTime <= '${hasta}'`,
    `and trashed = false`,
  ].join(" ");
}
