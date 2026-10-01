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
import { propuestaVigente, type EstadoDeExploracion } from "./contenido";
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
      titulo: "Las 8 dimensiones de cada área en juego, estimadas",
      cumplido: estado.areas.length > 0 && chequeo.completo,
    },
    { id: "meta", titulo: "Al menos una meta en cifras", cumplido: (c.metas ?? []).some(metaEnCifras) },
    {
      id: "autoridad",
      titulo: "Quién firma y a quién más le afecta",
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
 * Una sola indicación de qué hacer ahora: la primera cosa que falta, en el orden del proceso. Una
 * reunión sin leer va antes que lo propuesto: lo nuevo de esa reunión puede cambiar lo que hay que
 * revisar.
 */
export function queSigue(estado: EstadoDeExploracion, chequeo: ResultadoDelChequeo, sinLeer: readonly ReunionSinLeer[] = []): string {
  const pendientes = propuestaVigente(estado).length;
  if (!estado.perfilCierre || !estado.perfilDespues) return "Elige la industria y el perfil de negocio: la escala los pide antes de medir.";
  if (estado.areas.length === 0) return "Elige las áreas en juego: la del test y las que el prospecto nombró o paga sin usar.";
  if (sinLeer.length === 1) return `Hay una reunión sin leer («${sinLeer[0].titulo}», ${diaCorto(sinLeer[0].fecha)}): pídele al agente que la lea, en «Lo que quedó».`;
  if (sinLeer.length > 1) return `Hay ${sinLeer.length} reuniones sin leer: pídele al agente que las lea, en «Lo que quedó».`;
  if (pendientes > 0) return `Revisa lo que propuso el agente: ${pendientes} ${pendientes === 1 ? "cosa" : "cosas"} para usar o descartar.`;
  if (!chequeo.completo) {
    const faltan = chequeo.areas.reduce((s, a) => s + a.faltan.length, 0);
    return `Estima ${faltan === 1 ? "la dimensión que falta" : `las ${faltan} dimensiones que faltan`}: sin las 8 no se sabe cuál es la más débil.`;
  }
  const puntos = listaParaProponer(estado, chequeo);
  const falta = (id: PuntoDeCalidad["id"]) => !puntos.find((p) => p.id === id)?.cumplido;
  if (falta("meta")) return "Falta una meta en cifras: de cuánto a cuánto y para cuándo.";
  if (falta("siguientePaso")) return "Agenda el siguiente paso, con fecha.";
  if (falta("autoridad")) return "Falta saber quién firma y a quién más le afecta la decisión.";
  if (falta("consecuencia")) return "Falta qué pasa si no actúa.";
  if (falta("portal")) return "Revisen el portal en la segunda reunión, o marca que no usa HubSpot.";
  return "Lista para proponer: arma la propuesta.";
}
