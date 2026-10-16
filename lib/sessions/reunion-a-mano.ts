/**
 * lib/sessions/reunion-a-mano.ts — una reunión agregada a mano (etapa 4f del roadmap de «Para ti», 2026-10-15).
 * CLIENT-SAFE y puro: lo usan el formulario, la ruta, la cola y la lectura.
 *
 * Dos casos, con el mismo formulario:
 *   · una reunión que NO pasó por Meet (Zoom, Teams, presencial, una llamada): se crea con `source = "manual"` y un id
 *     `manual_…`, con el cliente y los proyectos que eligió la persona;
 *   · una reunión de Meet que no dejó transcripción ni notas: se le agrega lo que pasó.
 *
 * Lo que pasó entra de una de dos formas, y la diferencia importa:
 *   · la TRANSCRIPCIÓN (pegada o en un archivo) va a `transcript`, igual que la de Meet: son palabras de alguien;
 *   · lo que la persona RECUERDA (un resumen, unas notas, lo que sea) va a `summary.overview` con la marca `aMano`. La
 *     lectura lo lee entero (minuta, tareas, pedidos fuera de alcance), pero nunca como palabras del cliente: una queja
 *     que solo está en un recuerdo va al vigía como evidencia, no levanta una alerta sola.
 *
 * La marca vive en el Json de `summary` (`aMano`): sin SQL. Nada de esto depende del equipo de quien la agrega: la
 * reunión es de la cuenta y la lee cualquier equipo (docs/mi-dia-plan.md, «Cómo escala a todos los equipos»).
 */

/** `FirefliesSession.source` de una reunión creada a mano. Meet escribe "google_meet". */
export const FUENTE_A_MANO = "manual";

/** El id de una reunión creada a mano. Meet usa el id del evento: nunca chocan. */
export const PREFIJO_A_MANO = "manual_";

export type TipoDeContenido = "transcripcion" | "recuerdo";

/**
 * Quién agregó lo que pasó, cómo y cuándo. Va en `summary.aMano`. Es un `type` y no una `interface` a propósito: así
 * entra a un campo Json de Prisma sin un cast.
 */
export type MarcaAMano = {
  tipo: TipoDeContenido;
  /** Correo de quien lo agregó. */
  por: string;
  /** Su nombre, para decir «lo que recuerda Ana». */
  nombre: string | null;
  /** ISO. */
  at: string;
};

/** Lo mínimo que se lee de un recuerdo: dos líneas alcanzan para una minuta. */
export const MIN_RECUERDO = 40;
/** Lo mínimo de una transcripción, el mismo piso que Meet (`MIN_TRANSCRIPT_CHARS`, lib/google/doc-parse.ts). */
export const MIN_TRANSCRIPCION = 200;
/** El tope del texto, el mismo que Meet (`MAX_TRANSCRIPT_CHARS`, lib/google/doc-parse.ts). Lo vigila una prueba. */
export const MAX_TEXTO_A_MANO = 150_000;
/** Cuántas personas se pueden anotar. */
export const MAX_PERSONAS = 40;
/** Cuántos proyectos se pueden elegir. */
export const MAX_PROYECTOS = 10;
/** Lo que se acepta subir como archivo de la reunión. */
export const ACEPTA_ARCHIVO_DE_REUNION = ".txt,.vtt,.srt,.md";
/**
 * El tope del archivo. Se lee en el navegador (no sube al servidor: nginx corta en 1 MB y lo que se guarda es el texto);
 * 3 MB de subtítulos son varias horas de reunión.
 */
export const MAX_BYTES_ARCHIVO = 3 * 1024 * 1024;

/**
 * El texto de un archivo de la reunión, listo para revisar: los subtítulos pasados a turnos, con el tope, y qué pestaña
 * sugerir. Word y PDF no se leen: se copia el texto y se pega.
 */
export function textoDelArchivo(nombre: string, crudo: string): { texto: string; tipoSugerido: TipoDeContenido; recortado: boolean } {
  const limpio = crudo.replace(/^\uFEFF/, "");
  const subtitulos = esArchivoDeSubtitulos(nombre, limpio);
  const entero = (subtitulos ? normalizarSubtitulos(limpio) : limpio).trim();
  const texto = entero.slice(0, MAX_TEXTO_A_MANO);
  return { texto, tipoSugerido: subtitulos || pareceTranscripcion(texto) ? "transcripcion" : "recuerdo", recortado: entero.length > MAX_TEXTO_A_MANO };
}

export function esReunionAMano(sessionId: string): boolean {
  return sessionId.startsWith(PREFIJO_A_MANO);
}

/** La marca de lo agregado a mano, o null. Tolerante: un Json raro es «sin marca». */
export function leerMarcaAMano(summary: unknown): MarcaAMano | null {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  const m = (summary as { aMano?: unknown }).aMano;
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  if (o.tipo !== "transcripcion" && o.tipo !== "recuerdo") return null;
  if (typeof o.por !== "string" || !o.por.trim()) return null;
  return {
    tipo: o.tipo,
    por: o.por,
    nombre: typeof o.nombre === "string" && o.nombre.trim() ? o.nombre.trim() : null,
    at: typeof o.at === "string" ? o.at : "",
  };
}

/** El recuerdo de una reunión, si es lo que tiene (la marca dice «recuerdo» y hay texto). */
export function recuerdoDeLaReunion(summary: unknown): string | null {
  const marca = leerMarcaAMano(summary);
  if (marca?.tipo !== "recuerdo") return null;
  const o = (summary as { overview?: unknown }).overview;
  return typeof o === "string" && o.trim() ? o.trim() : null;
}

/** El Json de `summary` de una reunión con lo que recuerda la persona. */
export function summaryDelRecuerdo(texto: string, marca: MarcaAMano): { overview: string; aMano: MarcaAMano } {
  return { overview: texto.trim(), aMano: marca };
}

/** El Json de `summary` de una reunión con la transcripción agregada a mano (el texto va a `transcript`). */
export function summaryDeLaTranscripcion(marca: MarcaAMano): { aMano: MarcaAMano } {
  return { aMano: marca };
}

/** «Ana» de «Ana Gómez», o el usuario del correo. */
export function nombreCorto(marca: Pick<MarcaAMano, "nombre" | "por">): string {
  return marca.nombre?.split(/\s+/)[0] ?? marca.por.split("@")[0];
}

/**
 * Cómo se llaman las notas de una reunión cuando se le muestran a un modelo o a una persona: las de Gemini, o lo que
 * recuerda quien la agregó (que no es una transcripción ni un resumen de una grabación).
 */
export function etiquetaDeLasNotas(summary: unknown): string {
  const marca = leerMarcaAMano(summary);
  return marca?.tipo === "recuerdo" ? `Lo que recuerda ${nombreCorto(marca)} (agregado a mano)` : "Notas de Gemini";
}

/** Lo que tiene una reunión sin transcripción, dicho en minúscula para ir entre paréntesis después del título. */
export function queTieneSinTranscripcion(summary: unknown): string {
  const marca = leerMarcaAMano(summary);
  return marca?.tipo === "recuerdo" ? `lo que recuerda ${nombreCorto(marca)}, agregado a mano` : "solo las notas de Gemini";
}

/* ── Quién estuvo ──────────────────────────────────────────────────────────────────── */

/**
 * Una persona anotada sin correo («Ana Pérez»). Meet guarda siempre correos (medido el 2026-10-15: 0 de 8.281
 * reuniones con un participante sin «@»), así que esto solo pasa en una reunión agregada a mano, y siempre es
 * alguien de afuera: a la gente del equipo se la elige de la lista, con su correo.
 */
export function esPersonaSinCorreo(p: string): boolean {
  return !p.includes("@");
}

const ESPACIOS = /\s+/g;

/** Las personas del cliente escritas en una caja: separadas por coma, punto y coma o renglón. */
export function leerPersonasEscritas(texto: string): string[] {
  return texto
    .split(/[,;\n]/)
    .map((p) => p.replace(ESPACIOS, " ").trim())
    .filter((p) => p.length >= 2 && p.length <= 120);
}

/** Los participantes que se guardan: los correos en minúsculas, los nombres tal cual, sin repetir y con tope. */
export function participantesDeLaReunion(equipo: readonly string[], delCliente: readonly string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const crudo of [...equipo, ...delCliente]) {
    const p = crudo.replace(ESPACIOS, " ").trim();
    if (!p) continue;
    const valor = esPersonaSinCorreo(p) ? p : p.toLowerCase();
    const clave = valor.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(valor);
    if (out.length >= MAX_PERSONAS) break;
  }
  return out;
}

/* ── Cuándo fue ────────────────────────────────────────────────────────────────────── */

/**
 * La fecha y hora de la reunión, en hora de Costa Rica (UTC-6, sin horario de verano). Sin hora, el mediodía: así la
 * reunión cae en su día en cualquier zona en que se lea.
 */
export function inicioDeLaReunion(fecha: string, hora: string | null | undefined): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const h = hora && /^\d{2}:\d{2}$/.test(hora) ? hora : "12:00";
  const d = new Date(`${fecha}T${h}:00-06:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** El día de una fecha en hora de Costa Rica, «AAAA-MM-DD». */
export function diaEnCostaRica(d: Date): string {
  return new Date(+d - 6 * 3_600_000).toISOString().slice(0, 10);
}

/** El inicio y el fin (exclusivo) de un día de Costa Rica. */
export function limitesDelDia(fecha: string): { desde: Date; hasta: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const desde = new Date(`${fecha}T00:00:00-06:00`);
  if (Number.isNaN(desde.getTime())) return null;
  return { desde, hasta: new Date(+desde + 86_400_000) };
}

/* ── El texto de un archivo ────────────────────────────────────────────────────────── */

const ES_TIEMPO = /-->/;
const ES_INDICE = /^\d+$/;
const VOZ = /^<v(?:\.[^\s>]*)?\s+([^>]+)>(.*?)(?:<\/v>)?$/i;
const HABLANTE = /^([^:\n]{1,60}):\s+(.+)$/;
const ETIQUETA = /<[^>]+>/g;

/**
 * Pasa unos subtítulos (.vtt de Zoom o Teams, .srt) a la forma de una transcripción de Meet: un turno por renglón,
 * «Nombre: lo que dijo», juntando los renglones seguidos de la misma persona. Saca los tiempos, los números de bloque
 * y las etiquetas. Un texto que no es de subtítulos sale igual, solo sin espacios de más.
 */
export function normalizarSubtitulos(texto: string): string {
  const lineas = texto.replace(/\r/g, "").replace(/^\uFEFF/, "").split("\n");
  const turnos: { quien: string | null; texto: string }[] = [];
  let enNota = false;
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i].trim();
    if (!l) {
      enNota = false;
      continue;
    }
    if (/^WEBVTT/i.test(l) || /^(STYLE|REGION)\b/.test(l)) continue;
    if (/^NOTE\b/.test(l)) {
      enNota = true;
      continue;
    }
    if (enNota || ES_TIEMPO.test(l) || ES_INDICE.test(l)) continue;
    // El identificador de un bloque (Teams escribe uno largo) es el renglón justo antes del tiempo.
    if (ES_TIEMPO.test(lineas[i + 1] ?? "")) continue;

    let quien: string | null = null;
    let dicho = l;
    const voz = VOZ.exec(l);
    if (voz) {
      quien = voz[1].trim();
      dicho = voz[2];
    } else {
      const h = HABLANTE.exec(l.replace(ETIQUETA, ""));
      if (h) {
        quien = h[1].trim();
        dicho = h[2];
      }
    }
    dicho = dicho.replace(ETIQUETA, "").replace(ESPACIOS, " ").trim();
    if (!dicho) continue;

    const ultimo = turnos[turnos.length - 1];
    if (ultimo && (quien === null || quien === ultimo.quien)) {
      ultimo.texto = `${ultimo.texto} ${dicho}`;
    } else {
      turnos.push({ quien, texto: dicho });
    }
  }
  return turnos.map((t) => (t.quien ? `${t.quien}: ${t.texto}` : t.texto)).join("\n");
}

/** ¿El archivo es de subtítulos? Por la extensión o por la primera línea. */
export function esArchivoDeSubtitulos(nombre: string, texto: string): boolean {
  return /\.(vtt|srt)$/i.test(nombre) || /^\uFEFF?WEBVTT/.test(texto) || /^\d+\r?\n\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(texto);
}

/**
 * ¿Lo que se subió parece una transcripción (turnos «Nombre: …») o un texto suelto? Solo para sugerir la pestaña: la
 * persona elige.
 */
export function pareceTranscripcion(texto: string): boolean {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lineas.length < 4) return false;
  const conHablante = lineas.filter((l) => HABLANTE.test(l)).length;
  return conHablante / lineas.length >= 0.5;
}

/* ── Qué hacer con lo que llega ────────────────────────────────────────────────────── */

/** Por qué no se puede guardar lo que pasó, o null. */
export function problemaDelContenido(tipo: TipoDeContenido, texto: string): string | null {
  const largo = texto.trim().length;
  if (largo > MAX_TEXTO_A_MANO) return `Es demasiado largo: el tope es de ${MAX_TEXTO_A_MANO.toLocaleString("es-CR")} caracteres.`;
  if (tipo === "transcripcion" && largo < MIN_TRANSCRIPCION) {
    return `Una transcripción necesita ${MIN_TRANSCRIPCION} caracteres o más. Si es un resumen, pásalo a «Lo que recuerdas».`;
  }
  if (tipo === "recuerdo" && largo < MIN_RECUERDO) return "Cuéntalo en unas líneas más: con tan poco, Nexus no tiene qué leer.";
  return null;
}

/** Una reunión del mismo día, para preguntar si es la misma antes de crear otra. */
export interface ReunionDelDia {
  id: string;
  titulo: string;
  /** ISO. */
  inicio: string;
  /** Tiene transcripción (o notas de Gemini, o lo agregado a mano). */
  tieneTexto: boolean;
  aMano: boolean;
}

/**
 * ¿Se le puede agregar lo que pasó a esta reunión? Solo si no tiene nada que leer: lo que dejó Meet no se pisa.
 * null = se puede.
 */
export function porQueNoSeLePuedeAgregar(r: { largoTranscript: number; largoNotas: number }): string | null {
  if (r.largoTranscript >= MIN_TRANSCRIPCION) return "Esa reunión ya tiene transcripción.";
  if (r.largoNotas >= MIN_RECUERDO) return "Esa reunión ya tiene notas.";
  return null;
}
