/**
 * lib/exploraciones/linea-de-la-escala.ts — LA LÍNEA DE ARRIBA DE LA ESCALA de la preventa (24 nov; Elías: «es demasiada
 * información y está desacomodado; lo único que hay que entender es si alguna parte tiene que actualizarse»). PURO y
 * client-safe.
 *
 * Reemplaza dos bloques: la fila «1 Ubicar con las reuniones · 2 Confirmar en el mapa · 3 Armar el Resumen» con «Ubicada
 * el …», y lo de «Dónde está hoy» (el objetivo de la primera venta, lo explorado y «Armado el … con lo que se habló»).
 * Queda UNA frase y UN botón, el de siempre: «Ubicar con las reuniones» (el agente lee las transcripciones de las sesiones
 * y propone los niveles). Lo que dice, en este orden:
 *   1. Nexus la está ubicando ahora (otro trabajo del agente en la preventa no cambia la frase: el botón espera).
 *   2. Nunca se ubicó: con reuniones que leer, que falta hacerlo; sin ninguna, que no hay qué leer todavía.
 *   3. Hay reuniones de después de la última vez que se ubicó: cuántas, y el botón dice «Actualizar».
 *   4. La escala está al día pero el Resumen se armó antes de alguna reunión: se rehace con «Rehacer con IA», en el Resumen
 *      (el botón de esta línea no lo arma: no se le suma un segundo botón).
 *   5. Al día: cuándo se ubicó y con cuántas reuniones.
 * Cuenta solo las reuniones que «Ubicar» lee (`sirveParaUbicar`: de Meet, con texto, ni cortadas ni de puertas adentro), y
 * de esas, las que leería hoy (las más nuevas, `REUNIONES_QUE_LEE_UBICAR`).
 *
 * Qué leyó la última vez sale de lo que guardó la corrida (`leyo`: «Reunión del 5 nov 2026: Título», el rótulo de
 * lib/exploraciones/fuentes.ts › `transcripcionesDeLaExploracion`): una reunión que leería hoy y no está ahí es nueva,
 * aunque sea de antes (su transcripción llegó después de ubicar). Una corrida sin esos rótulos (de antes, o que no leyó
 * reuniones) se mira por la fecha. Una leída solo con las notas de Gemini vuelve a ser nueva cuando llega su transcripción.
 * Si alguien cambia el título de una reunión ya leída, cuenta como nueva hasta volver a ubicar.
 */
import { diaConAnio, diaCorto } from "./fechas";
import { REUNIONES_QUE_LEE_UBICAR, sirveParaUbicar } from "./posicionar";

/** Una reunión de una sesión de la preventa (la de cada pestaña: useSesiones › `pestanas`). */
export interface ReunionDeLaLinea {
  fecha: string;
  titulo?: string;
  origen: string;
  texto?: string;
  corta?: unknown;
  puertasAdentro?: true;
}

export type EstadoDeLaLinea = "ubicando" | "sinReuniones" | "sinUbicar" | "nuevas" | "resumenAtrasado" | "alDia";

export interface LineaDeLaEscala {
  estado: EstadoDeLaLinea;
  texto: string;
  /** El botón de «Ubicar con las reuniones». `fuerte`: hay algo nuevo (el primario). */
  boton: { etiqueta: string; fuerte: boolean };
}

const despuesDe = (iso: string, desde: string) => Date.parse(iso) > Date.parse(desde);
/** Cómo empieza el rótulo de una reunión leída en lo que guarda la corrida. */
const ROTULO = "Reunión del ";
/** Hasta dónde guarda la corrida cada rótulo (lib/exploraciones/agente.ts › `guardar`: `leyo` cortado a 200). */
const LARGO_DEL_ROTULO = 200;
const reuniones = (n: number) => (n === 1 ? "1 reunión" : `${n} reuniones`);

export function lineaDeLaEscala(o: {
  reuniones: readonly ReunionDeLaLinea[];
  /** Cuándo corrió por última vez «Ubicar con las reuniones» (la corrida `posicionar`). */
  ubicadaEn: string | null;
  /** Lo que leyó esa corrida (`CorridaDelAgente.leyo`). */
  leyo?: readonly string[];
  /** Cuándo se armó el Resumen (`resumenDeLaEscala.at`). */
  resumenEn: string | null;
  /** Corre «Ubicar con las reuniones» (la corrida `posicionar`). Otro trabajo del agente no cambia la frase. */
  ubicando: boolean;
}): LineaDeLaEscala {
  const conTexto = o.reuniones.filter((r) => sirveParaUbicar(r) && !Number.isNaN(Date.parse(r.fecha)));
  const volver = { etiqueta: "Volver a ubicar con las reuniones", fuerte: false };
  if (o.ubicando) return { estado: "ubicando", texto: "Nexus está ubicando la escala con las reuniones.", boton: { etiqueta: "Ubicando…", fuerte: false } };
  if (!o.ubicadaEn) {
    if (!conTexto.length)
      return { estado: "sinReuniones", texto: "Todavía no hay reuniones con transcripción o notas para ubicar la escala.", boton: { etiqueta: "Ubicar con las reuniones", fuerte: false } };
    return {
      estado: "sinUbicar",
      texto: `La escala todavía no se ubicó con las reuniones: hay ${reuniones(conTexto.length)} para leer.`,
      boton: { etiqueta: "Ubicar con las reuniones", fuerte: true },
    };
  }
  const ubicada = o.ubicadaEn;
  const leidasEntonces = (o.leyo ?? []).filter((l) => l.startsWith(ROTULO));
  /* La leyó si hay un rótulo con su fecha y su título ENTERO (lo guardado se corta a 200 letras: un título largo se compara
     hasta ahí). Leída solo con las notas de Gemini («Reunión del … (solo las notas…): …») y con la transcripción ya llegada,
     no la leyó: la transcripción es lo nuevo. */
  const laLeyo = (r: ReunionDeLaLinea) =>
    leidasEntonces.some((l) => {
      const fecha = `${ROTULO}${diaConAnio(r.fecha)}`;
      if (!l.startsWith(fecha)) return false;
      const resto = l.slice(fecha.length);
      const conNotas = resto.startsWith(" (");
      if (conNotas && r.texto === "transcripcion") return false;
      if (!r.titulo) return true;
      const titulo = resto.slice(resto.indexOf(": ") + 2);
      return resto.includes(": ") && (titulo === r.titulo || (l.length >= LARGO_DEL_ROTULO && r.titulo.startsWith(titulo)));
    });
  // Las que leería hoy: las más nuevas con texto.
  const hoy = new Set([...conTexto].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha)).slice(0, REUNIONES_QUE_LEE_UBICAR));
  const nuevas = conTexto.filter((r) => despuesDe(r.fecha, ubicada) || (leidasEntonces.length > 0 && hoy.has(r) && !laLeyo(r))).length;
  if (nuevas > 0)
    return {
      estado: "nuevas",
      texto: `${nuevas === 1 ? "Hay 1 reunión nueva" : `Hay ${nuevas} reuniones nuevas`} desde que se ubicó la escala, el ${diaCorto(ubicada)}.`,
      boton: { etiqueta: "Actualizar", fuerte: true },
    };
  const leidas = leidasEntonces.length || Math.min(conTexto.length, REUNIONES_QUE_LEE_UBICAR);
  const resumen = o.resumenEn;
  const despuesDelResumen = resumen ? conTexto.filter((r) => despuesDe(r.fecha, resumen)).length : 0;
  if (despuesDelResumen > 0)
    return {
      estado: "resumenAtrasado",
      texto: `La escala está al día, pero el Resumen se armó antes de ${despuesDelResumen === 1 ? "la última reunión" : `las últimas ${despuesDelResumen} reuniones`}: rehazlo con IA en el Resumen.`,
      boton: volver,
    };
  return { estado: "alDia", texto: `Ubicada el ${diaCorto(ubicada)}${leidas ? ` con ${reuniones(leidas)}` : ""} · al día.`, boton: volver };
}
