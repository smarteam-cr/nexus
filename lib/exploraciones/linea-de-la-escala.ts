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
 *   4. La escala está al día pero el Resumen se armó antes de alguna reunión, o leyó cortadas reuniones largas antes de que
 *      se leyeran enteras (24 nov, `cortadasQueSeLeenEnteras`): se rehace con «Rehacer con IA», en el Resumen (el botón de
 *      esta línea no lo arma: no se le suma un segundo botón).
 *   5. Al día: cuándo se ubicó y con cuántas reuniones.
 * Cuenta solo las reuniones que «Ubicar» lee (`sirveParaUbicar`: de Meet, con texto, ni cortadas ni de puertas adentro), y
 * de esas, las que leería hoy (las más nuevas, `REUNIONES_QUE_LEE_UBICAR`).
 *
 * Qué leyó la última vez sale de lo que guardó la corrida (`leyo`: «Reunión del 5 nov 2026: Título», el rótulo de
 * lib/exploraciones/fuentes.ts › `transcripcionesDeLaExploracion`): una reunión que leería hoy y no está ahí es nueva,
 * aunque sea de antes (su transcripción llegó después de ubicar). Una corrida sin esos rótulos (de antes, o que no leyó
 * reuniones) se mira por la fecha. Una leída solo con las notas de Gemini vuelve a ser nueva cuando llega su transcripción.
 * Si alguien cambia el título de una reunión ya leída, cuenta como nueva hasta volver a ubicar.
 *
 * La preventa de un CLIENTE (24 nov, `conLoQueYaSabemos`; DECISIONS «La escala de un cliente con lo que ya sabemos»): sin
 * sesiones de diagnóstico, el botón dice «Ubicar con lo que ya sabemos» y nunca falta qué leer (la base de la empresa). Las
 * reuniones de trabajo (`deTrabajo`) cuentan, pero las sesiones de diagnóstico van primero entre las que leería hoy, como
 * en «Ubicar» (posicionar.ts › `reunionesParaUbicar`): una sesión de diagnóstico sumada sobre una base de trabajo es nueva
 * aunque haya capacitaciones más recientes. Lo leído en resumen («Reunión del … (resumen): …») no se cuenta como reunión
 * leída.
 */
import type { ReunionMalLeida } from "@/lib/external/pagina-del-resumen";
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
  /** Es la de una reunión de trabajo (`SesionPlaneada.deLoQueYaSabemos`), no la de una sesión de diagnóstico. */
  deTrabajo?: true;
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
/** Lo que leyó en resumen la base de la empresa (posicionar-fuentes.ts): no es una reunión leída entera. */
const EN_RESUMEN = / \(resumen\): /;

/**
 * Cuántas reuniones leyó cortadas un Resumen armado antes de que se leyeran enteras (24 nov, Elías: «que se lean enteras»):
 * rehacerlo las lee enteras. Uno armado ya con la regla nueva no cuenta: si alguna quedó cortada, era tan larga que no
 * entró ni con el tope nuevo, y rehacerlo no la cambia.
 */
export function cortadasQueSeLeenEnteras(g: { leidasEnteras?: true; malLeidas?: readonly { motivos: readonly string[] }[] } | null | undefined): number {
  if (!g || g.leidasEnteras) return 0;
  return (g.malLeidas ?? []).filter((m) => m.motivos.includes("recortada")).length;
}

/**
 * Las reuniones mal leídas que salen en la nota de La escala y de su sesión (components/exploraciones/ReunionesMalLeidas.tsx):
 * sin lo cortado que rehacer el Resumen lee entero (eso lo dice esta línea). `enteras`: el Resumen ya se armó leyéndolas
 * enteras, y una cortada era más larga que el tope.
 */
export function malLeidasParaMostrar(reuniones: readonly ReunionMalLeida[], enteras: boolean): ReunionMalLeida[] {
  return reuniones.flatMap((m) => {
    const motivos = enteras ? m.motivos : m.motivos.filter((x) => x !== "recortada");
    return motivos.length ? [{ ...m, motivos }] : [];
  });
}

/**
 * Cuántas reuniones cambiaron de clase (de trabajo o de diagnóstico) después de armar el Resumen (24 nov, D4): «Lo que
 * hicimos» guarda la clase de cada una al armarse, y si se publica sin rehacerlo, el cliente leería la cuenta de antes.
 * Se comparan por su fecha (la misma de la reunión en las dos listas).
 */
export function marcasQueCambiaron(
  delResumen: readonly { fecha: string; deTrabajo?: true }[] | null | undefined,
  reuniones: readonly Pick<ReunionDeLaLinea, "fecha" | "deTrabajo">[],
): number {
  if (!delResumen?.length) return 0;
  const enElResumen = new Map(delResumen.map((x) => [x.fecha, !!x.deTrabajo]));
  return reuniones.filter((r) => enElResumen.has(r.fecha) && enElResumen.get(r.fecha) !== !!r.deTrabajo).length;
}

export function lineaDeLaEscala(o: {
  reuniones: readonly ReunionDeLaLinea[];
  /** Cuándo corrió por última vez «Ubicar con las reuniones» (la corrida `posicionar`). */
  ubicadaEn: string | null;
  /** Lo que leyó esa corrida (`CorridaDelAgente.leyo`). */
  leyo?: readonly string[];
  /** Cuándo se armó el Resumen (`resumenDeLaEscala.at`). */
  resumenEn: string | null;
  /** Las reuniones que ese Resumen leyó cortadas y rehacerlo lee enteras (`cortadasQueSeLeenEnteras`). */
  cortadas?: number;
  /** Corre «Ubicar con las reuniones» (la corrida `posicionar`). Otro trabajo del agente no cambia la frase. */
  ubicando: boolean;
  /** La preventa de un cliente (24 nov, posicionar.ts › `partirDeLoQueYaSabemos`): ubica también con lo que ya sabemos. */
  conLoQueYaSabemos?: boolean;
  /** Las reuniones que cambiaron de clase después de armar el Resumen (`marcasQueCambiaron`). */
  marcasCambiadas?: number;
}): LineaDeLaEscala {
  const conTexto = o.reuniones.filter((r) => sirveParaUbicar(r) && !Number.isNaN(Date.parse(r.fecha)));
  // Sin ninguna sesión de diagnóstico, la preventa de un cliente se ubica con lo que ya sabemos (la base de la empresa).
  const conLaBase = !!o.conLoQueYaSabemos && !conTexto.some((r) => !r.deTrabajo);
  const conQue = conLaBase ? "con lo que ya sabemos" : "con las reuniones";
  const volver = { etiqueta: `Volver a ubicar ${conQue}`, fuerte: false };
  if (o.ubicando) return { estado: "ubicando", texto: `Nexus está ubicando la escala ${conQue}.`, boton: { etiqueta: "Ubicando…", fuerte: false } };
  if (!o.ubicadaEn) {
    if (conLaBase)
      return {
        estado: "sinUbicar",
        texto: `Todavía no hay sesiones de diagnóstico: la escala se ubica con lo que ya sabemos de la empresa (${
          conTexto.length ? `${conTexto.length === 1 ? "1 reunión de trabajo" : `${conTexto.length} reuniones de trabajo`}, las demás reuniones en resumen` : "sus reuniones con Smarteam en resumen"
        }, el proyecto y la memoria).`,
        boton: { etiqueta: "Ubicar con lo que ya sabemos", fuerte: true },
      };
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
  const leidasEnteras = leidasEntonces.filter((l) => !EN_RESUMEN.test(l));
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
  // Las que leería hoy: las más nuevas con texto, primero las sesiones de diagnóstico (como `reunionesParaUbicar`).
  const hoy = new Set(
    [...conTexto].sort((a, b) => Number(!!a.deTrabajo) - Number(!!b.deTrabajo) || Date.parse(b.fecha) - Date.parse(a.fecha)).slice(0, REUNIONES_QUE_LEE_UBICAR),
  );
  const nuevasReuniones = conTexto.filter((r) => despuesDe(r.fecha, ubicada) || (leidasEntonces.length > 0 && hoy.has(r) && !laLeyo(r)));
  const nuevas = nuevasReuniones.length;
  if (nuevas > 0) {
    // Sobre una base de trabajo, una sesión de diagnóstico se nombra como tal (24 nov).
    const deDiagnostico = !!o.conLoQueYaSabemos && nuevasReuniones.every((r) => !r.deTrabajo);
    const cuantas = deDiagnostico
      ? nuevas === 1
        ? "Hay 1 sesión de diagnóstico nueva"
        : `Hay ${nuevas} sesiones de diagnóstico nuevas`
      : nuevas === 1
        ? "Hay 1 reunión nueva"
        : `Hay ${nuevas} reuniones nuevas`;
    return { estado: "nuevas", texto: `${cuantas} desde que se ubicó la escala, el ${diaCorto(ubicada)}.`, boton: { etiqueta: "Actualizar", fuerte: true } };
  }
  const leidas = leidasEnteras.length || (leidasEntonces.length ? 0 : Math.min(conTexto.length, REUNIONES_QUE_LEE_UBICAR));
  const resumen = o.resumenEn;
  const despuesDelResumen = resumen ? conTexto.filter((r) => despuesDe(r.fecha, resumen)).length : 0;
  const cortadas = resumen ? (o.cortadas ?? 0) : 0;
  const marcas = resumen ? (o.marcasCambiadas ?? 0) : 0;
  if (despuesDelResumen > 0 || cortadas > 0 || marcas > 0) {
    const antes = despuesDelResumen > 0 ? `se armó antes de ${despuesDelResumen === 1 ? "la última reunión" : `las últimas ${despuesDelResumen} reuniones`}` : "";
    const largas = cortadas > 0 ? `leyó cortada${cortadas === 1 ? " 1 reunión larga" : `s ${cortadas} reuniones largas`}` : "";
    const clase = marcas > 0 ? `cuenta ${marcas === 1 ? "1 reunión" : `${marcas} reuniones`} con otra clase (de trabajo o de diagnóstico)` : "";
    return {
      estado: "resumenAtrasado",
      texto: `La escala está al día, pero el Resumen ${[antes, largas, clase].filter(Boolean).join(" y ")}: rehazlo con IA en el Resumen${cortadas > 0 ? ` para que ${cortadas === 1 ? "la lea entera" : "las lea enteras"}` : ""}.`,
      boton: volver,
    };
  }
  const conCuantas = conLaBase ? " con lo que ya sabemos" : leidas ? ` con ${reuniones(leidas)}` : "";
  return { estado: "alDia", texto: `Ubicada el ${diaCorto(ubicada)}${conCuantas} · al día.`, boton: volver };
}
