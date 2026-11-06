/**
 * lib/exploraciones/agenda.ts — la guía de una sesión como AGENDA por bloques (2026-11-06, especificación de Elías). PURO.
 *
 * La guía de antes era una lista larga de preguntas sin orden: con el cliente enfrente nadie la podía usar. Ahora la guía
 * sirve para AVERIGUAR cosas:
 *   · arriba, el objetivo de la sesión y de 3 a 4 cosas que hay que tener claras al terminar (siempre los retos, cómo los
 *     mide hoy y a dónde quiere llegar);
 *   · una agenda de 4 a 6 bloques, cada uno con sus minutos, un título y UNA pregunta para abrir; uno es el central;
 *   · dentro de cada bloque, lo que hay que averiguar (en el orden en que ocurre el proceso) con 1 o 2 preguntas
 *     sugeridas. Lo que hay que averiguar no cambia; las preguntas se adaptan a lo que va diciendo el cliente;
 *   · cada cosa se marca cuando ya se sabe. Lo que ya se sabía (por el traspaso, por una sesión anterior) nace marcado.
 *
 * La apertura y el cierre son iguales en todas las guías (el primer y el último bloque). Las guías de antes (sin
 * `agenda`) se siguen viendo como se armaron.
 *
 * Las marcas viven en `SesionPlaneada.hechas`, como las de las preguntas de antes: `av:<huella>` marca una cosa; en una
 * que ya se sabía, `!av:<huella>` la desmarca. La huella sale del texto de lo que se averigua: una guía rearmada con la
 * misma cosa conserva su marca.
 */
import type { PasoDeLaPregunta } from "./plan-de-la-guia";
import type { PreguntaDeLaGuia } from "./guia";

/** Una cosa por averiguar dentro de un bloque. */
export interface CosaPorAveriguar {
  /** `av:` y la huella de `que`. */
  id: string;
  /** Lo que hay que saber al terminar, en pocas palabras («Cómo se asignan los interesados»). */
  que: string;
  /** 1 o 2 preguntas sugeridas, abiertas y de una sola cosa. */
  preguntas: string[];
  /** A qué apunta (una tarjeta del marco, una dimensión de la escala o un tema del equipo), si a algo. */
  para?: string;
  /** Ya se sabía desde antes: de dónde («el traspaso», «la sesión 1»). Nace marcada. */
  sabido?: string;
}

export type TipoDeBloque = "apertura" | "cuerpo" | "cierre";

export interface BloqueDeLaAgenda {
  /** Minuto en que empieza y en que termina. */
  desde: number;
  hasta: number;
  titulo: string;
  tipo: TipoDeBloque;
  /** La ÚNICA pregunta para abrir la conversación del bloque (en la apertura y el cierre, lo que se dice). */
  abre: string;
  /** El bloque central: el que no se puede pasar rápido. Uno por agenda. */
  central?: true;
  /** El bloque fijo del resultado que buscan (resultado.ts): sus seis cosas tienen ids estables. */
  resultado?: true;
  averiguar: CosaPorAveriguar[];
  /** Qué datos conviene obtener y cómo convertirlos en impacto (costo, tiempo, ventas perdidas, seis meses más igual). */
  impacto?: string;
}

export interface AgendaDeLaGuia {
  /** De 3 a 4 cosas que hay que tener claras al terminar la sesión. */
  claves: string[];
  bloques: BloqueDeLaAgenda[];
  /** Preventa: la frase para cuando el cliente pide un demo o precios (por qué primero entendemos su caso). */
  fraseDeDemo?: string;
}

export const MIN_BLOQUES = 4;
export const MAX_BLOQUES = 6;
export const MAX_CLAVES = 4;
export const MAX_AVERIGUAR_POR_BLOQUE = 5;
/** El bloque del resultado trae seis cosas fijas (resultado.ts): el esquema guardado acepta hasta seis. */
export const MAX_AVERIGUAR_GUARDADAS = 6;
export const MAX_PREGUNTAS_SUGERIDAS = 2;
export const DURACION_POR_DEFECTO = 60;

/** La huella de lo que se averigua: estable entre guías mientras el texto sea el mismo (sin mayúsculas ni espacios de más). */
export function idDeAveriguar(que: string): string {
  const t = que.trim().toLowerCase().replace(/\s+/g, " ");
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return `av:${h.toString(36)}`;
}

/** ¿Está marcada? Lo que ya se sabía nace marcado y se desmarca con `!av:…`; lo demás se marca con `av:…`. */
export function estaAveriguada(c: Pick<CosaPorAveriguar, "id" | "sabido">, hechas: readonly string[] | undefined): boolean {
  const h = hechas ?? [];
  return c.sabido ? !h.includes(`!${c.id}`) : h.includes(c.id);
}

/**
 * Las marcas después de marcar o desmarcar una cosa. Al marcar una que apunta a algo, su tema también queda como
 * preguntado (`hechas` con el tema, como las preguntas de antes): así lo de después de la sesión cuenta igual.
 */
export function alternarAveriguada(c: Pick<CosaPorAveriguar, "id" | "sabido" | "para">, hechas: readonly string[] | undefined, max = 30): string[] {
  const h = new Set(hechas ?? []);
  const marcada = estaAveriguada(c, hechas);
  if (c.sabido) {
    if (marcada) h.add(`!${c.id}`);
    else h.delete(`!${c.id}`);
  } else if (marcada) h.delete(c.id);
  else {
    h.add(c.id);
    if (c.para) h.add(c.para);
  }
  // Las marcas de esta agenda primero: lo viejo es lo que se cae si se pasa del tope.
  const todas = [...h];
  return todas.length > max ? todas.slice(todas.length - max) : todas;
}

/** Lo averiguado y el total de una agenda (para la cabecera y para la continuidad). */
export function avanceDeLaAgenda(agenda: AgendaDeLaGuia, hechas: readonly string[] | undefined): { sabidas: number; total: number } {
  const cosas = agenda.bloques.flatMap((b) => b.averiguar);
  return { sabidas: cosas.filter((c) => estaAveriguada(c, hechas)).length, total: cosas.length };
}

/**
 * Una pregunta que se responde con sí, no o un número (punto 11): «¿Tienen reglas para…?», «¿Cuántos vendedores…?».
 * Solo mira cómo ABRE la pregunta: «¿Cómo deciden cuántos…?» está bien.
 */
export function preguntaCerrada(texto: string): boolean {
  const q = texto.trim().replace(/^[«"]+/, "");
  const cuerpo = q.includes("¿") ? q.slice(q.indexOf("¿") + 1) : q;
  // «¿Puedes contarme…?» pide que cuente: es abierta.
  if (/^(me\s+)?puedes\s+(contarme|contar|describirme|describir|explicarme|explicar|mostrarme|mostrar)\b/i.test(cuerpo.trim())) return false;
  return /^(tienen|tiene|tienes|hay|existe|existen|es|son|est[aá]n?|est[aá]s|usan|usas|usa|han|has|ha|pueden|puedes|puede|cuentan con|cuentas con|saben|sabes|lo|la|los|las|se|les|te|alguna vez|cu[aá]nt[oa]s?)\b/i.test(
    cuerpo.trim(),
  );
}

/**
 * Una pregunta que pregunta dos cosas a la vez (punto 11): dos signos de pregunta, o una segunda pregunta pegada con «, y
 * qué…», «, y cómo…», «, y cuántos…» (la validación del 2026-11-06 las encontró así: «¿De dónde vienen los clientes, y
 * cuántos llegan por mes?»).
 */
export function preguntaDoble(texto: string): boolean {
  if ((texto.match(/\?/g) ?? []).length > 1) return true;
  return PEGADA.test(texto);
}

// Sin `\b`: en JavaScript no ve las letras con tilde como letras («qué» seguido de un espacio no tiene límite de palabra).
const PEGADA = /,\s*y\s+(qu[eé]|c[oó]mo|cu[aá]nt[oa]s?|qui[eé]n(es)?|d[oó]nde|por qu[eé]|cu[aá]ndo|para cu[aá]ndo|cu[aá]l(es)?)(?=[\s,;:¿?]|$)/i;

/**
 * Una pregunta doble, partida en dos de una sola cosa (lo que el reintento no arregló): «¿A, y qué B?» → «¿A?» y «¿Qué B?»;
 * «¿A? ¿B?» → las dos. Una que no es doble queda igual.
 */
export function partirPreguntaDoble(texto: string): string[] {
  const t = texto.trim();
  const signos = t.match(/[^?]+\?/g);
  if (signos && signos.length > 1) return signos.map((s) => s.trim()).filter(Boolean);
  const m = PEGADA.exec(t);
  if (!m) return [t];
  const primera = t.slice(0, m.index).trim();
  const resto = t.slice(m.index + m[0].length - m[1].length).trim();
  const segunda = resto.charAt(0).toUpperCase() + resto.slice(1);
  const cierra = (s: string) => (/[?.]$/.test(s) ? s : `${s}?`);
  return [primera.includes("¿") ? cierra(primera) : `${primera.replace(/[,.]$/, "")}.`, cierra(segunda.startsWith("¿") ? segunda : `¿${segunda}`)];
}

/** Lo que se dice, sin espacios por completar: «llegar a [resultado en sus palabras]» → «llegar a (resultado en sus palabras)». */
export function sinHuecos(texto: string): string {
  return texto.replace(/\[([^\]]+)\]/g, "($1)");
}

/** Un espacio por completar («[retos con sus palabras]»): lo que se dice tiene que poder decirse tal cual. */
export function conHueco(texto: string): boolean {
  return /\[[^\]]*\]/.test(texto);
}

/**
 * Lo que no cumple en una agenda, para pedirla otra vez (como el voseo): preguntas cerradas o dobles, y textos con un
 * espacio por completar.
 */
export function preguntasQueNoCumplen(agenda: AgendaDeLaGuia): string[] {
  const preguntas = agenda.bloques.flatMap((b) => [...(b.tipo === "cuerpo" ? [b.abre] : []), ...b.averiguar.flatMap((c) => c.preguntas)]);
  const textos = agenda.bloques.flatMap((b) => [b.abre, b.impacto ?? ""]);
  return [...preguntas.filter((p) => preguntaCerrada(p) || preguntaDoble(p)), ...textos.filter(conHueco)];
}

/** El aviso para pedirla otra vez sin preguntas cerradas ni dobles ni espacios por completar. */
export function avisoDePreguntasCerradas(malas: readonly string[]): string {
  return `\n\nEn tu intento anterior hubo preguntas que se responden con sí, no o un número, que preguntan dos cosas (dos signos de pregunta, o una segunda pegada con «, y qué…», «, y cuántos…»), o textos con un espacio por completar como «[…]» (${malas
    .slice(0, 6)
    .map((p) => `«${p}»`)
    .join(", ")}). Reescríbelas: abiertas y de una sola cosa («Cuéntame cómo…», «¿Cómo deciden…?», «¿Qué pasa cuando…?»), y lo que se dice, escrito para decirse tal cual (en el cierre: «Resume con sus palabras los dos o tres retos que salieron»).`;
}

/**
 * Las preguntas de antes, sacadas de la agenda: una por tema (la primera cosa que apunta a él), para lo que todavía las
 * lee (lo que cubre la guía, lo ya preguntado, el correo de seguimiento). La pantalla muestra la agenda, no estas.
 */
export function preguntasDeLaAgenda(agenda: AgendaDeLaGuia, pasoDe: (para: string) => PasoDeLaPregunta | undefined, max: number): PreguntaDeLaGuia[] {
  const out: PreguntaDeLaGuia[] = [];
  const vistos = new Set<string>();
  for (const b of agenda.bloques) {
    for (const c of b.averiguar) {
      if (!c.para || vistos.has(c.para) || !c.preguntas.length) continue;
      vistos.add(c.para);
      const paso = pasoDe(c.para);
      out.push({ para: c.para, pregunta: c.preguntas[0], repreguntas: c.preguntas.slice(1), investiga: c.que.slice(0, 200), ...(paso ? { paso } : {}) });
    }
  }
  return out.slice(0, max);
}

/** Los temas (tarjetas, dimensiones, temas del equipo) que toca la agenda, sin repetir. */
export function temasDeLaAgenda(agenda: AgendaDeLaGuia): string[] {
  return [...new Set(agenda.bloques.flatMap((b) => b.averiguar.map((c) => c.para).filter((p): p is string => !!p)))];
}

/** «0–5 min». */
export function minutosDelBloque(b: Pick<BloqueDeLaAgenda, "desde" | "hasta">): string {
  return `${b.desde}–${b.hasta} min`;
}
