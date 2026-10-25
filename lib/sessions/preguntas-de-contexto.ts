/**
 * lib/sessions/preguntas-de-contexto.ts — LA PERSONA APORTA EL CONTEXTO DE UNA REUNIÓN SIN TEXTO (T9, 2026-10-24;
 * docs/reuniones-pieza-angular-plan.md). PURO y client-safe.
 *
 * El caso: «Cemaco | Data Hub» del 22 oct ocurrió, con 7 personas, y nadie activó la transcripción. En vez de una caja en
 * blanco, Nexus le hace a quien estuvo dos o tres preguntas armadas con lo que ya sabe de las OTRAS reuniones de la
 * misma empresa (las trae el servidor por el chokepoint, `getClientSessions`: nunca de otra empresa):
 *   · el tema del título («¿Qué se habló o se decidió sobre «Data Hub»?»);
 *   · lo que quedó de la reunión anterior con minuta (un acuerdo, o un tema si no dejó acuerdos);
 *   · un riesgo abierto de las últimas reuniones;
 *   · y siempre, qué quedó pendiente y quién lo tiene.
 * Sin IA: las preguntas salen de la minuta que ya está. Lo que responde se guarda como el texto de esa reunión (un
 * recuerdo con la marca `aMano`, origen «preguntas»: «lo contó una persona») y se lee como cualquier otra.
 */
import { TITLE_MATCH_STOPWORDS, normalize } from "./categorize";
import { MIN_RECUERDO } from "./reunion-a-mano";

export interface OtraReunionDeLaEmpresa {
  titulo: string;
  fecha: Date;
  /** De su minuta. */
  temas: string[];
  acuerdos: string[];
  riesgos: string[];
}

export interface PreguntaDeContexto {
  id: string;
  texto: string;
  /** De dónde salió, para que se entienda por qué la hace. */
  porque: string | null;
}

/** Cuántas preguntas como mucho (la de «qué quedó pendiente» incluida). */
export const MAX_PREGUNTAS = 3;
/** El largo con que se cita un acuerdo, un tema o un riesgo dentro de la pregunta. */
const LARGO_DE_LA_CITA = 140;

const PALABRAS_DE_RELLENO = new Set(["smarteam", "y", "con", "de", "del", "la", "el", "los", "las", "en", "x"]);

function citar(t: string): string {
  const limpio = t.replace(/\s+/g, " ").trim().replace(/[.;:,]+$/, "");
  return limpio.length > LARGO_DE_LA_CITA ? `${limpio.slice(0, LARGO_DE_LA_CITA - 1).trimEnd()}…` : limpio;
}

/** «15 oct», en hora de Costa Rica. */
export function fechaCorta(d: Date): string {
  return d.toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" }).replace(".", "");
}

/**
 * El tema del título, sin la empresa, sin Smarteam y sin palabras de proceso («kickoff», «seguimiento»…). «Cemaco | Data
 * Hub» → «Data Hub». null si no queda nada que sirva para preguntar.
 */
export function temaDelTitulo(titulo: string, empresa: string): string | null {
  const deLaEmpresa = new Set(normalize(empresa).split(/[^a-z0-9]+/).filter((w) => w.length >= 2));
  const sobra = (w: string) => {
    const n = normalize(w);
    return !n || deLaEmpresa.has(n) || TITLE_MATCH_STOPWORDS.has(n) || PALABRAS_DE_RELLENO.has(n);
  };
  const partes = titulo
    .split(/\s*[|·:/+–—]\s*|\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const parte of partes) {
    const palabras = parte.split(/\s+/);
    if (palabras.every(sobra)) continue;
    // Se quitan las de la empresa y de relleno de las puntas, no del medio («Data Hub de Ventas» queda entero).
    let i = 0;
    let j = palabras.length;
    while (i < j && sobra(palabras[i])) i++;
    while (j > i && sobra(palabras[j - 1])) j--;
    const tema = palabras.slice(i, j).join(" ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (tema.replace(/[^\p{L}]/gu, "").length >= 4) return tema;
  }
  return null;
}

/** Los textos de un campo Json de la minuta (`[{ text }]` o `["…"]`), tolerante. */
export function textosDeLaMinuta(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string" ? (x as { text: string }).text : ""))
    .map((t) => t.trim())
    .filter(Boolean);
}

export function armarPreguntas(o: { titulo: string; empresa: string; otras: readonly OtraReunionDeLaEmpresa[] }): PreguntaDeContexto[] {
  const preguntas: PreguntaDeContexto[] = [];
  const tema = temaDelTitulo(o.titulo, o.empresa);
  if (tema) preguntas.push({ id: "tema", texto: `¿Qué se habló o se decidió sobre «${citar(tema)}»?`, porque: "Por el título de la reunión." });

  const otras = [...o.otras].sort((a, b) => +b.fecha - +a.fecha);
  const anterior = otras.find((r) => r.acuerdos.length || r.temas.length);
  if (anterior) {
    const donde = `«${citar(anterior.titulo)}» (${fechaCorta(anterior.fecha)})`;
    preguntas.push(
      anterior.acuerdos.length
        ? { id: "anterior", texto: `En ${donde} quedó: «${citar(anterior.acuerdos[0])}». ¿En qué quedó eso?`, porque: `De la reunión anterior con ${o.empresa}.` }
        : { id: "anterior", texto: `En ${donde} se habló de «${citar(anterior.temas[0])}». ¿Se retomó en esta reunión?`, porque: `De la reunión anterior con ${o.empresa}.` },
    );
  }
  const conRiesgo = otras.slice(0, 3).find((r) => r.riesgos.length);
  if (conRiesgo && preguntas.length < MAX_PREGUNTAS - 1) {
    preguntas.push({ id: "riesgo", texto: `¿Sigue en pie esto: «${citar(conRiesgo.riesgos[0])}»?`, porque: `Un riesgo que dejó «${citar(conRiesgo.titulo)}» (${fechaCorta(conRiesgo.fecha)}).` });
  }
  const recortadas = preguntas.slice(0, MAX_PREGUNTAS - 1);
  if (recortadas.length === 0) recortadas.push({ id: "para-que", texto: "¿Para qué fue la reunión y qué se decidió?", porque: null });
  recortadas.push({ id: "pendiente", texto: "¿Qué quedó pendiente después de esta reunión, y quién lo tiene?", porque: null });
  return recortadas;
}

export interface RespuestaDeContexto {
  pregunta: string;
  respuesta: string;
}

/** Lo que respondió la persona, sin las preguntas: es lo que tiene que alcanzar para leerse. */
function largoDeLoRespondido(respuestas: readonly RespuestaDeContexto[], extra: string): number {
  return respuestas.reduce((s, r) => s + r.respuesta.trim().length, 0) + extra.trim().length;
}

/** Por qué no se puede guardar, o null. */
export function problemaDeLasRespuestas(respuestas: readonly RespuestaDeContexto[], extra: string): string | null {
  if (largoDeLoRespondido(respuestas, extra) < MIN_RECUERDO) return "Cuéntalo en unas líneas más: con tan poco, Nexus no tiene qué leer.";
  return null;
}

/** El texto que queda en la reunión: cada pregunta con su respuesta (las sin responder no van), y lo demás. */
export function textoDeLasRespuestas(respuestas: readonly RespuestaDeContexto[], extra: string): string {
  const bloques = respuestas
    .filter((r) => r.respuesta.trim())
    .map((r) => `${r.pregunta.trim()}\n${r.respuesta.trim()}`);
  if (extra.trim()) bloques.push(`Algo más:\n${extra.trim()}`);
  return `Lo que contó una persona que estuvo, respondiendo las preguntas de Nexus:\n\n${bloques.join("\n\n")}`;
}

/** ¿Quien mira estuvo en la reunión (la organizó o estaba invitado)? Quien estuvo es quien responde. */
export function estuvoEnLaReunion(r: { organizador: string | null; participantes: readonly string[] }, email: string): boolean {
  const yo = email.trim().toLowerCase();
  return !!yo && [r.organizador ?? "", ...r.participantes].some((e) => e.trim().toLowerCase() === yo);
}
