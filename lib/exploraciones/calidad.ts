/**
 * lib/exploraciones/calidad.ts — ¿la preventa está lista para proponer el land?, y qué sigue. PURO.
 *
 * La primera venta es un LAND: un proyecto acotado —un equipo, lo que lo frena, una meta, un
 * presupuesto— que cierra rápido y prueba valor (Elías, 2026-10-05; la página «Land and Expand» de
 * Documentación). Por eso los siete puntos no piden la escala entera: piden saber qué frena al equipo
 * del land, dicho por el cliente, y que la arquitectura de la venta tenga lo que hace falta para
 * venderlo (meta en cifras, para cuándo, presupuesto, quién firma, qué pasa si no actúa y el
 * siguiente paso con fecha). Las 8 dimensiones, el portal y lo no explorado siguen en el lienzo y le
 * sirven al CSE, pero no frenan la propuesta del land. AVISAN, no bloquean: el vendedor puede
 * proponer igual, y la foto del momento queda para la métrica.
 */
import type { ResultadoDelChequeo } from "@/lib/escala/chequeo";
import { estaDebajo } from "@/lib/escala/chequeo";
import { metaEnCifras } from "./casillas";
import { esFuenteDeHipotesis, esHipotesisDeNivel, propuestaVigente, type EstadoDeExploracion } from "./contenido";
import { diaCorto, hoyEnCostaRica } from "./fechas";
import type { ReunionSinLeer } from "./lectura";

export interface PuntoDeCalidad {
  id: "frena" | "meta" | "tiempos" | "presupuesto" | "autoridad" | "consecuencia" | "siguientePaso";
  titulo: string;
  /** El nombre corto, para un chip (el panel de la derecha). */
  corto: string;
  cumplido: boolean;
}

/**
 * ¿Se sabe qué frena al equipo del land? Una dimensión de un área en juego por debajo de Funcional,
 * dicha por el cliente (`chequeo` es el de lo confirmado con evidencia: una hipótesis no cuenta).
 */
function sabeQueLoFrena(chequeo: ResultadoDelChequeo): boolean {
  return chequeo.areas.some((a) => a.dimensiones.some((d) => d.aplica && d.nivel !== null && estaDebajo(d.nivel, "F")));
}

const conTexto = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0);

/**
 * ¿El siguiente paso sigue en pie? Tiene fecha y no pasó (rediseño de las sesiones, 2026-10-07: en
 * CreditForce el siguiente paso era del 28 sep y contaba como listo el 7 oct). `hoy` es `AAAA-MM-DD`.
 */
export function siguientePasoVigente(paso: { fecha?: string } | undefined, hoy: string): boolean {
  return !!paso?.fecha && paso.fecha >= hoy;
}

export function listaParaProponer(estado: EstadoDeExploracion, chequeo: ResultadoDelChequeo, hoy = hoyEnCostaRica()): PuntoDeCalidad[] {
  const c = estado.contenido.casillas;
  return [
    { id: "frena", titulo: "Qué frena al equipo del land, dicho por el cliente", corto: "Qué frena al equipo", cumplido: estado.areas.length > 0 && sabeQueLoFrena(chequeo) },
    { id: "meta", titulo: "Al menos una meta en cifras", corto: "Meta en cifras", cumplido: (c.metas ?? []).some(metaEnCifras) },
    { id: "tiempos", titulo: "Para cuándo lo necesita", corto: "Para cuándo", cumplido: conTexto(c.tiempos) },
    { id: "presupuesto", titulo: "El presupuesto o contra qué lo compara", corto: "Presupuesto", cumplido: conTexto(c.presupuesto) },
    { id: "autoridad", titulo: "Quién firma", corto: "Quién firma", cumplido: (c.autoridad ?? []).some((p) => p.rol === "firma") },
    { id: "consecuencia", titulo: "Qué pasa si no actúa", corto: "Qué pasa si no actúa", cumplido: (c.consecuencias ?? []).length > 0 },
    { id: "siguientePaso", titulo: "Siguiente paso con fecha", corto: "Siguiente paso con fecha", cumplido: siguientePasoVigente(c.siguientePaso, hoy) },
  ];
}

/**
 * ¿La guía de una sesión pregunta por este punto? (el panel lo pinta en azul: «se pregunta en la
 * próxima sesión»). `paras` son a qué apuntan sus preguntas; el siguiente paso se pide siempre al cerrar.
 */
export function puntoQueSePregunta(id: PuntoDeCalidad["id"], paras: ReadonlySet<string>, hayDimensiones: boolean): boolean {
  switch (id) {
    case "frena":
      return hayDimensiones;
    case "meta":
      return paras.has("metas");
    case "tiempos":
      return paras.has("tiempos");
    case "presupuesto":
      return paras.has("presupuesto");
    case "autoridad":
      return paras.has("autoridad");
    case "consecuencia":
      return paras.has("consecuencias");
    case "siguientePaso":
      return true;
  }
}

/**
 * La pestaña del lienzo donde se hace lo que sigue (la pantalla pone el botón para ir). null = está
 * en el resumen de arriba, que siempre se ve.
 */
export type PasoDeQueSigue = "preparacion" | "exploracion" | "escala" | "casos";

/** Cuántas cosas sugeridas por el agente esperan que alguien las use o las descarte (las hipótesis de nivel no: son el mapa). */
export function cuantasParaRevisar(estado: EstadoDeExploracion): number {
  return propuestaVigente(estado).filter((it) => !esHipotesisDeNivel(it)).length;
}

/**
 * Una sola indicación de qué hacer ahora: la primera cosa que falta, en el orden del proceso, con el
 * paso donde se hace. Una reunión sin leer va antes que lo propuesto: lo nuevo de esa reunión puede
 * cambiar lo que hay que revisar. Las hipótesis de nivel no cuentan como «para revisar»: son el mapa
 * de lo que se cree, y se confirman en las reuniones.
 */
export function queSigueConPaso(
  estado: EstadoDeExploracion,
  chequeo: ResultadoDelChequeo,
  sinLeer: readonly ReunionSinLeer[] = [],
  hoy = hoyEnCostaRica(),
): { texto: string; paso: PasoDeQueSigue | null } {
  const revisables = cuantasParaRevisar(estado);
  if (!estado.perfilCierre || !estado.perfilDespues) {
    return { texto: "Revisa la escala y el perfil de negocio: hacen falta antes de medir.", paso: "escala" };
  }
  if (estado.areas.length === 0) return { texto: "Elige las áreas en juego: la del test y las que el prospecto nombró o paga sin usar.", paso: "escala" };
  if (sinLeer.length === 1) {
    const r = sinLeer[0];
    const texto =
      r.origen === "documento"
        ? `Hay algo que sumaste sin leer («${r.titulo}», ${diaCorto(r.fecha)}): pídele al agente que lo lea.`
        : `Hay una reunión sin leer («${r.titulo}», ${diaCorto(r.fecha)}): pídele al agente que la lea.`;
    return { texto, paso: "exploracion" };
  }
  if (sinLeer.length > 1) {
    const todasReuniones = sinLeer.every((r) => r.origen !== "documento");
    return { texto: `Hay ${sinLeer.length} ${todasReuniones ? "reuniones" : "reuniones o documentos"} sin leer: pídele al agente que las lea.`, paso: "exploracion" };
  }
  if (revisables > 0) return { texto: `Revisa lo que sugirió el agente: ${revisables} ${revisables === 1 ? "cosa" : "cosas"} para usar o descartar.`, paso: null };
  // Todavía nada que haya dicho el cliente: lo que hay son hipótesis. Toca la primera reunión.
  const conEvidencia = Object.values(estado.contenido.chequeo).some((e) => !esFuenteDeHipotesis(e.fuente));
  if (!conEvidencia && estado.propuesta.leidas.sesiones.length === 0) {
    return {
      texto: "Haz la primera reunión con la guía de «Exploración»: qué preguntar, cómo profundizar y cómo manejar las objeciones. Cuando llegue la transcripción, el agente la lee solo.",
      paso: "exploracion",
    };
  }
  const puntos = listaParaProponer(estado, chequeo, hoy);
  const falta = (id: PuntoDeCalidad["id"]) => !puntos.find((p) => p.id === id)?.cumplido;
  if (falta("frena")) return { texto: "Falta saber qué frena al equipo del land, dicho por el cliente: pregúntalo en la próxima reunión con la guía de la escala.", paso: "escala" };
  if (falta("meta")) return { texto: "Falta una meta en cifras: de cuánto a cuánto y para cuándo. Pregúntala en la próxima reunión.", paso: null };
  if (falta("siguientePaso")) {
    const viejo = estado.contenido.casillas.siguientePaso?.fecha;
    return { texto: viejo ? `El siguiente paso era del ${diaCorto(viejo)} y ya pasó: agenda el próximo, con fecha.` : "Agenda el siguiente paso, con fecha.", paso: "exploracion" };
  }
  if (falta("autoridad")) return { texto: "Falta saber quién firma.", paso: null };
  if (falta("consecuencia")) return { texto: "Falta qué pasa si no actúa.", paso: null };
  if (falta("tiempos")) return { texto: "Falta para cuándo lo necesita.", paso: null };
  if (falta("presupuesto")) return { texto: "Falta el presupuesto, o contra qué lo va a comparar.", paso: null };
  return { texto: "Lista para proponer el land: elige los casos de uso y arma la propuesta.", paso: "casos" };
}

/** Lo mismo, solo el texto (la lista de exploraciones). */
export function queSigue(estado: EstadoDeExploracion, chequeo: ResultadoDelChequeo, sinLeer: readonly ReunionSinLeer[] = [], hoy = hoyEnCostaRica()): string {
  return queSigueConPaso(estado, chequeo, sinLeer, hoy).texto;
}
