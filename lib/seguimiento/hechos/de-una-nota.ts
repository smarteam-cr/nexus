/**
 * lib/seguimiento/hechos/de-una-nota.ts — los hechos que deja una NOTA DEL EQUIPO («Hablar con Nexus», 21 nov). PURO.
 *
 * Nacen como los de una reunión: se verifican con `leerSalidaDeHechos` (la cita tiene que estar en la nota guardada,
 * palabra por palabra, con su largo, sin voseo ni gente de Smarteam, sin repetir y con su tope). Lo distinto, a propósito:
 * los dijo alguien del equipo (`quien = smarteam`, la cita es de un texto sumado a mano) y su destino es la preventa donde
 * se contó, delegado en ella. Los escribe lib/seguimiento/hechos-server.ts › `escribirHechosDeUnaNota`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { DESTINOS } from "../destinos";
import type { DestinoDelHecho } from "./estado";
import { HERRAMIENTA_DE_HECHOS } from "./pedido";
import { leerSalidaDeHechos, prepararParaVerificar, type SalidaDeHechos } from "./salida";

export interface HechoCrudoDeLaNota {
  tipo: string;
  frase: string;
  cita: string;
  tema?: string;
  gravedad?: string;
}

/** Verifica los hechos que propuso el modelo contra el texto de la nota. Todos de la cuenta, todos dichos por el equipo. */
export function hechosVerificadosDeUnaNota(texto: string, crudos: readonly HechoCrudoDeLaNota[], equipoSmarteam: readonly string[]): SalidaDeHechos {
  const respuesta: Pick<Anthropic.Messages.Message, "content" | "stop_reason"> = {
    content: [{ type: "tool_use", id: "nota", name: HERRAMIENTA_DE_HECHOS, input: { hechos: crudos.map((h) => ({ ...h, ambito: "cuenta", quien: "smarteam" })) } }] as Anthropic.Messages.Message["content"],
    stop_reason: "end_turn",
  };
  const t = texto.trim();
  return leerSalidaDeHechos(respuesta, {
    texto: prepararParaVerificar({ partes: [{ fuente: "texto", texto: t }], turnos: [], fuente: "texto", recortada: false, caracteres: t.length }),
    proyectosPorRef: new Map(),
    equipoSmarteam,
  });
}

/** Sus destinos: la preventa donde se contó, delegados en ella (ya tiene la nota). */
export function destinosDeUnaNota(exploracionId: string): DestinoDelHecho[] {
  return DESTINOS.filter((d) => d.salida === "preventa").map((d) => ({ clave: d.clave, estado: "delegado" as const, ref: { tipo: "preventa" as const, exploracionIds: [exploracionId] } }));
}
