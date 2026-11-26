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
 *
 * Desde el 25 nov la respuesta también puede fijar el nivel de su parte («Ubicar» lee las notas, notas-del-equipo.ts ›
 * `notasParaUbicar`): `notasSinUbicar` dice cuáles todavía no leyó, para ofrecer volver a ubicar antes de rehacer el Resumen.
 */
import { cuandoSeEscribioLaNota, esClaveDeLoQueSabes } from "./lo-que-sabes";
import { notasQueLeeUbicar } from "./notas-del-equipo";
import { esRespuesta, respondeA } from "./forma-de-la-respuesta";

/* La forma de una respuesta vive en forma-de-la-respuesta.ts (25 nov: el build de producción se caía con agente-pedido.ts
   importando este archivo). Se reexporta para que nada más cambie. */
export { equiposDeLasRespuestas, esRespuesta, prefijoDeLaRespuesta, respondeA, type PreguntaParaResponder } from "./forma-de-la-respuesta";

/** Lo de `contenido.autoresDeLasNotas` que se usa: cuándo se escribió cada nota. */
type Autores = Readonly<Record<string, { en?: string | null } | undefined>> | null | undefined;

/** Cuándo se escribió una nota (la regla única: lo-que-sabes.ts › `cuandoSeEscribioLaNota`). */
const cuandoSeEscribio = (clave: string, autores: Autores): string | null => cuandoSeEscribioLaNota(clave, autores?.[clave]);

/** La respuesta más nueva a esta pregunta en «Lo que sabes del cliente», con cuándo se guardó. */
export function respuestaDe(notas: Readonly<Record<string, string>>, autores: Autores, equipo: string, dimension: string): { clave: string; en: string | null } | null {
  const suyas = Object.entries(notas)
    .filter(([k, t]) => esClaveDeLoQueSabes(k) && respondeA(t, equipo, dimension))
    .map(([clave]) => ({ clave, en: cuandoSeEscribio(clave, autores) }))
    .sort((a, b) => (a.en ?? "").localeCompare(b.en ?? "") || a.clave.localeCompare(b.clave));
  return suyas.at(-1) ?? null;
}

/**
 * Las claves de las notas de «Lo que sabes del cliente» que llegaron después de `desde` (cuando empezó a leer el Resumen
 * que hay): el Resumen no las leyó. La fecha es la que guardó el servidor o, si no está, la de su clave; sin ninguna, no
 * cuenta (no se sabe si es nueva).
 */
export function clavesNuevasDesde(notas: Readonly<Record<string, string>>, autores: Autores, desde: string | null): string[] {
  if (!desde) return [];
  const corte = Date.parse(desde);
  if (!Number.isFinite(corte)) return [];
  return Object.entries(notas)
    .filter(([clave, texto]) => {
      if (!esClaveDeLoQueSabes(clave) || !texto.trim()) return false;
      const en = Date.parse(cuandoSeEscribio(clave, autores) ?? "");
      return Number.isFinite(en) && en > corte;
    })
    .map(([clave]) => clave);
}

/** Cuántas de esas notas hay y cuántas responden una pregunta de La escala. */
export function contarLasNotas(notas: Readonly<Record<string, string>>, claves: readonly string[]): { total: number; respuestas: number } {
  const conTexto = claves.filter((k) => (notas[k] ?? "").trim());
  return { total: conTexto.length, respuestas: conTexto.filter((k) => esRespuesta(notas[k])).length };
}

/** Lo que mira esto de una corrida de «Ubicar» (`CorridaDelAgente`). */
interface LoQueLeyoUbicar {
  modo: string;
  /** Cuándo terminó. */
  en: string;
  /** Las claves de las notas que leyó (25 nov). Sin el campo: una corrida de antes, que no leyó ninguna. */
  notas?: readonly string[];
  /** Cuándo empezó a leerlas. Sin el campo, cuando terminó. */
  notasEn?: string;
}

/** La última corrida de «Ubicar» (la `posicionar` más nueva), o null si nunca se ubicó (o ya no está entre las guardadas). */
export function ultimaUbicacion<C extends Pick<LoQueLeyoUbicar, "modo">>(corridas: readonly C[]): C | null {
  return [...corridas].reverse().find((c) => c.modo === "posicionar") ?? null;
}

/**
 * Las notas que «Ubicar» leería hoy y su última corrida NO leyó (25 nov, Elías: una nota puede fijar el nivel): las que no
 * están en lo que leyó (`CorridaDelAgente.notas`) o que se editaron después de que las leyó (`notasEn`: una editada mientras
 * «Ubicar» corría se leyó con el texto de antes, como en el Resumen con `leidoHasta`). Una corrida de antes del 25 nov (sin
 * `notas`) no leyó ninguna. Sin ninguna corrida de «Ubicar», todas las que leería. Solo las que «Ubicar» lee
 * (`notasQueLeeUbicar`, las más nuevas): una que ya no entra no la cambia volver a ubicar.
 */
export function notasSinUbicar(notas: Readonly<Record<string, string>>, autores: Autores, ultima: Omit<LoQueLeyoUbicar, "modo"> | null): string[] {
  const hoy = notasQueLeeUbicar(notas).map((n) => n.clave);
  if (!ultima) return hoy;
  const leidas = new Set(ultima.notas ?? []);
  const corte = Date.parse(ultima.notasEn ?? ultima.en);
  return hoy.filter((clave) => {
    if (!leidas.has(clave)) return true;
    const en = Date.parse(cuandoSeEscribio(clave, autores) ?? "");
    return Number.isFinite(en) && Number.isFinite(corte) && en > corte;
  });
}

/** «1 respuesta», «2 respuestas», «1 nota», «3 notas»: respuestas si todas lo son. "" sin ninguna. La regla única. */
export function cuantasNotas(n: { total: number; respuestas: number }): string {
  if (!n.total) return "";
  const palabra = n.respuestas === n.total ? "respuesta" : "nota";
  return `${n.total} ${palabra}${n.total === 1 ? "" : "s"}`;
}

/** «Hay 2 respuestas nuevas», «Hay 1 nota nueva en «Lo que sabes del cliente»». */
export function tituloDeLasNuevas(n: { total: number; respuestas: number }): string | null {
  const cuantas = cuantasNotas(n);
  if (!cuantas) return null;
  return `Hay ${cuantas} ${n.total === 1 ? "nueva" : "nuevas"}${n.respuestas === n.total ? "" : " en «Lo que sabes del cliente»"}`;
}

/**
 * Lo nuevo del equipo en La escala (25 nov), lo que deciden juntos el aviso de arriba del Resumen y la línea de debajo de
 * la página:
 *   · `delResumen`: las notas que el Resumen que hay no leyó (desde `resumenDesde`, que sale de `leidoHasta`);
 *   · `sinUbicar`: las que «Ubicar» no leyó la última vez (`notasSinUbicar`), para la línea;
 *   · `ubicarPrimero`: alguna de las del Resumen tampoco la leyó «Ubicar», y el aviso ofrece volver a ubicar antes de
 *     rehacer el Resumen. Solo en la preventa (la línea de «Ubicar» es suya) y si ya se ubicó alguna vez: si no, la línea
 *     dice que falta ubicarla y el aviso no la contradice ni esconde «Rehacer con IA».
 */
export function lasNotasNuevas(o: {
  notas: Readonly<Record<string, string>>;
  autores: Autores;
  corridas: readonly LoQueLeyoUbicar[];
  resumenDesde: string | null;
  enLaPreventa: boolean;
}): { delResumen: { total: number; respuestas: number }; sinUbicar: { total: number; respuestas: number }; ubicarPrimero: boolean } {
  const ultima = ultimaUbicacion(o.corridas);
  const delResumen = clavesNuevasDesde(o.notas, o.autores, o.resumenDesde);
  const sinUbicar = notasSinUbicar(o.notas, o.autores, ultima);
  const faltan = new Set(sinUbicar);
  return {
    delResumen: contarLasNotas(o.notas, delResumen),
    sinUbicar: contarLasNotas(o.notas, sinUbicar),
    ubicarPrimero: o.enLaPreventa && !!ultima && delResumen.some((k) => faltan.has(k)),
  };
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
