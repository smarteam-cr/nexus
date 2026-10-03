/**
 * lib/exploraciones/calidad.ts — ¿la exploración está lista para proponer?, y qué sigue. PURO.
 *
 * El lienzo es el proceso: si el vendedor lo sigue, la exploración queda bien hecha. Estos siete
 * puntos son lo que el caso que originó todo esto no tuvo (ninguna cifra del negocio, el portal sin
 * mirar, una pista grande sin seguir) más lo que sí se hizo bien (siguiente reunión con fecha, quién
 * decide). AVISAN, no bloquean: el vendedor puede proponer igual, y la foto del momento queda para
 * la métrica.
 */
import type { ResultadoDelChequeo } from "@/lib/escala/chequeo";
import { metaEnCifras } from "./casillas";
import { esFuenteDeHipotesis, esHipotesisDeNivel, propuestaVigente, type EstadoDeExploracion } from "./contenido";
import { diaCorto } from "./fechas";
import type { ReunionSinLeer } from "./lectura";

export interface PuntoDeCalidad {
  id: "dimensiones" | "meta" | "autoridad" | "consecuencia" | "portal" | "siguientePaso" | "noExplorado";
  titulo: string;
  cumplido: boolean;
}

export function listaParaProponer(estado: EstadoDeExploracion, chequeo: ResultadoDelChequeo): PuntoDeCalidad[] {
  const c = estado.contenido.casillas;
  const autoridad = c.autoridad ?? [];
  const pendientesNoExplorado = propuestaVigente(estado).filter(
    (it) => it.destino.tipo === "casilla" && it.destino.clave === "noExplorado",
  );
  return [
    {
      id: "dimensiones",
      titulo: "Dónde está cada equipo: las 8 dimensiones de cada área, con evidencia del cliente",
      cumplido: estado.areas.length > 0 && chequeo.completo,
    },
    { id: "meta", titulo: "Al menos una meta en cifras", cumplido: (c.metas ?? []).some(metaEnCifras) },
    {
      id: "autoridad",
      titulo: "Quién aprueba y a quién más le afecta",
      cumplido: autoridad.some((p) => p.rol === "firma") && autoridad.some((p) => p.rol === "afectado"),
    },
    { id: "consecuencia", titulo: "Qué pasa si no actúa", cumplido: (c.consecuencias ?? []).length > 0 },
    {
      id: "portal",
      titulo: "El portal revisado (o no usa HubSpot)",
      cumplido: estado.contenido.sinPortal || (c.portal ?? []).length > 0,
    },
    { id: "siguientePaso", titulo: "Siguiente paso con fecha", cumplido: !!c.siguientePaso?.fecha },
    {
      id: "noExplorado",
      titulo: "Lo que se dijo y nadie exploró, revisado",
      cumplido: pendientesNoExplorado.length === 0,
    },
  ];
}

/**
 * La pestaña del lienzo donde se hace lo que sigue (la pantalla pone el botón para ir). null = está
 * en el resumen de arriba, que siempre se ve.
 */
export type PasoDeQueSigue = "preparacion" | "exploracion" | "escala" | "casos";

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
): { texto: string; paso: PasoDeQueSigue | null } {
  const revisables = propuestaVigente(estado).filter((it) => !esHipotesisDeNivel(it)).length;
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
  if (!chequeo.completo) {
    const faltan = chequeo.areas.reduce((s, a) => s + a.faltan.length, 0);
    return {
      texto: `Falta confirmar ${faltan === 1 ? "una dimensión" : `${faltan} dimensiones`}: míralas en el mapa y pregúntalas en la próxima reunión (sin las 8 no se sabe cuál es la más débil).`,
      paso: "escala",
    };
  }
  const puntos = listaParaProponer(estado, chequeo);
  const falta = (id: PuntoDeCalidad["id"]) => !puntos.find((p) => p.id === id)?.cumplido;
  if (falta("meta")) return { texto: "Falta una meta en cifras: de cuánto a cuánto y para cuándo. Pregúntala en la próxima reunión.", paso: null };
  if (falta("siguientePaso")) return { texto: "Agenda el siguiente paso, con fecha.", paso: "exploracion" };
  if (falta("autoridad")) return { texto: "Falta saber quién aprueba y a quién más le afecta la decisión.", paso: null };
  if (falta("consecuencia")) return { texto: "Falta qué pasa si no actúa.", paso: null };
  if (falta("portal")) return { texto: "Revisen el portal en la próxima reunión, o marca que no usa HubSpot.", paso: "exploracion" };
  return { texto: "Lista para proponer: elige los casos de uso y arma la propuesta.", paso: "casos" };
}

/** Lo mismo, solo el texto (la lista de exploraciones). */
export function queSigue(estado: EstadoDeExploracion, chequeo: ResultadoDelChequeo, sinLeer: readonly ReunionSinLeer[] = []): string {
  return queSigueConPaso(estado, chequeo, sinLeer).texto;
}
