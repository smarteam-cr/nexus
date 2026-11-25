/**
 * lib/exploraciones/completar-el-diagnostico.ts — «Para completar el diagnóstico», debajo de la página de La escala (24 nov,
 * Elías con TEC · AE). PURO y client-safe.
 *
 * Lo que había debajo del radar («Lo que más frena a cada equipo» y «Para explorar más», con sus preguntas por parte y lo
 * «sin dato») pasa a ser UN lugar para completar lo que falta: cada pregunta trae «Responder con Nexus», que abre el MISMO
 * chat «Nexus» de la preventa (una sola puerta) con esa pregunta, su equipo y su parte como contexto. Lo que responde el
 * CSE queda como una nota de «Lo que sabes del cliente», con sus palabras (el chat ya lo hace así), y el Resumen lee esas
 * notas al rehacerse (`notasComoFuentes`, 21 nov).
 *
 * El contexto viaja EN el mensaje: el chat le antepone a lo primero que escribe la persona «Sobre Ventas · Datos
 * (cómo registran hoy los contactos): » (`prefijoDeLaRespuesta`). Así lo ve el modelo del chat, queda en la nota (y en la
 * conversación guardada, que sobrevive a recargar) y se reconoce después qué pregunta ya tiene respuesta
 * (`respuestaDe`). Sin los signos de pregunta a propósito: el chat lee como pregunta lo que tiene forma de pregunta.
 */
import { cuandoSeAgrego, esClaveDeLoQueSabes } from "./lo-que-sabes";

/** Una pregunta de La escala que se responde con Nexus. */
export interface PreguntaParaResponder {
  /** «Ventas», «Marketing»… */
  equipo: string;
  /** El nombre de la parte: «Datos», «Procesos»… */
  dimension: string;
  dimensionId: string;
  /** La pregunta, como se ve en la pantalla. */
  pregunta: string;
}

/** La pregunta sin sus signos ni el punto final, para ir entre paréntesis. */
function sinSignos(pregunta: string): string {
  return pregunta
    .replace(/[¿?]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;:,]+$/, "");
}

const PALABRA = "Sobre";
const SEPARADOR = " · ";
const RAIZ = (equipo: string, dimension: string) => `${PALABRA} ${equipo.trim()}${SEPARADOR}${dimension.trim()}`;
/** Cualquier respuesta: «Sobre <equipo> · <parte> (» o «…:» al principio de un renglón. Las mismas piezas que `RAIZ`. */
const UNA_RESPUESTA = new RegExp(`^${PALABRA} .+${SEPARADOR.trim()} .+?( \\(|:)`, "i");
/** Los renglones de una nota: la nota junta, renglón por renglón, todo lo que la persona contó antes de guardar. */
const renglones = (texto: string) => texto.split(/\r?\n/).map((l) => l.trim());

/** Lo que el chat antepone a la respuesta: «Sobre Ventas · Datos (cómo registran hoy los contactos): ». */
export function prefijoDeLaRespuesta(p: Pick<PreguntaParaResponder, "equipo" | "dimension" | "pregunta">): string {
  const q = sinSignos(p.pregunta);
  return `${RAIZ(p.equipo, p.dimension)}${q ? ` (${q.slice(0, 200)})` : ""}: `;
}

/**
 * ¿Esta nota responde a esa pregunta? Un renglón que empieza con su «Sobre <equipo> · <parte>», sin importar mayúsculas.
 * En cualquier renglón (revisión del 24 nov): con algo contado antes sin guardar, la respuesta queda en el medio de la nota.
 */
export function respondeA(texto: string, equipo: string, dimension: string): boolean {
  const raiz = RAIZ(equipo, dimension).toLowerCase();
  return renglones(texto).some((l) => {
    const t = l.toLowerCase();
    return t.startsWith(`${raiz} (`) || t.startsWith(`${raiz}:`);
  });
}

/** ¿La nota trae la respuesta a alguna pregunta de La escala? (la misma forma que `respondeA`, en cualquier renglón) */
export const esRespuesta = (texto: string): boolean => renglones(texto).some((l) => UNA_RESPUESTA.test(l));

/** Lo de `contenido.autoresDeLasNotas` que se usa: cuándo se escribió cada nota. */
type Autores = Readonly<Record<string, { en?: string | null } | undefined>> | null | undefined;

/** Cuándo se escribió una nota: lo que guardó el servidor; si no, el instante de su clave (`cuandoSeAgrego`). */
function cuandoSeEscribio(clave: string, autores: Autores): string | null {
  const en = autores?.[clave]?.en;
  if (en && Number.isFinite(Date.parse(en))) return en;
  const ms = cuandoSeAgrego(clave);
  return ms === null ? null : new Date(ms).toISOString();
}

/** La respuesta más nueva a esta pregunta en «Lo que sabes del cliente», con cuándo se guardó. */
export function respuestaDe(notas: Readonly<Record<string, string>>, autores: Autores, equipo: string, dimension: string): { clave: string; en: string | null } | null {
  const suyas = Object.entries(notas)
    .filter(([k, t]) => esClaveDeLoQueSabes(k) && respondeA(t, equipo, dimension))
    .map(([clave]) => ({ clave, en: cuandoSeEscribio(clave, autores) }))
    .sort((a, b) => (a.en ?? "").localeCompare(b.en ?? "") || a.clave.localeCompare(b.clave));
  return suyas.at(-1) ?? null;
}

/**
 * Las notas de «Lo que sabes del cliente» que llegaron después de `desde` (cuando empezó a leer el Resumen que hay): el
 * Resumen no las leyó. `respuestas`: las que responden una pregunta de La escala. La fecha es la que guardó el servidor o,
 * si no está, la de su clave; sin ninguna, no cuenta (no se sabe si es nueva).
 */
export function notasNuevasDesde(notas: Readonly<Record<string, string>>, autores: Autores, desde: string | null): { total: number; respuestas: number } {
  if (!desde) return { total: 0, respuestas: 0 };
  const corte = Date.parse(desde);
  if (!Number.isFinite(corte)) return { total: 0, respuestas: 0 };
  let total = 0;
  let respuestas = 0;
  for (const [clave, texto] of Object.entries(notas)) {
    if (!esClaveDeLoQueSabes(clave) || !texto.trim()) continue;
    const en = Date.parse(cuandoSeEscribio(clave, autores) ?? "");
    if (!Number.isFinite(en) || en <= corte) continue;
    total++;
    if (esRespuesta(texto)) respuestas++;
  }
  return { total, respuestas };
}

/** «Hay 2 respuestas nuevas», «Hay 1 nota nueva en «Lo que sabes del cliente»». */
export function tituloDeLasNuevas(n: { total: number; respuestas: number }): string | null {
  if (!n.total) return null;
  if (n.respuestas === n.total) return n.total === 1 ? "Hay 1 respuesta nueva" : `Hay ${n.total} respuestas nuevas`;
  return n.total === 1 ? "Hay 1 nota nueva en «Lo que sabes del cliente»" : `Hay ${n.total} notas nuevas en «Lo que sabes del cliente»`;
}

/**
 * El momento hasta el que leyó el Resumen que hay: cuando EMPEZÓ su corrida, si fue la última y terminó bien (una nota
 * guardada mientras Nexus escribía no entró); si no, cuando se armó.
 */
export function leidoHasta(resumenEn: string | null, corrida: { estado: string; empezo: string } | null): string | null {
  if (!resumenEn) return null;
  if (corrida?.estado === "DONE" && Date.parse(corrida.empezo) < Date.parse(resumenEn)) return corrida.empezo;
  return resumenEn;
}
