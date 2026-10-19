/**
 * lib/exploraciones/agregar-a-la-guia.ts — lo que revisa el asistente antes de proponer SUMAR una pregunta a la guía de
 * una sesión (lib/operaciones/guia-server.ts › `guia.pregunta.agregar`). PURO.
 *
 * Auditoría del 2026-10-19: el tope de preguntas sumadas se miraba recién al aplicar, así que la caja prometía «2
 * cambios» y entraba uno con un aviso; y al sumar no se revisaba si la pregunta repetía lo que el cliente ya dijo (solo
 * al cambiar). Se revisa al preparar, contando lo que ya está en la misma lista.
 */
import { AVISO_DEL_TOPE_DE_SUMADAS, MAX_PREGUNTAS_PROPIAS } from "./ajustes-de-la-guia";
import type { PreguntaParaMostrar } from "./guia";
import type { SaberDelCliente } from "./lo-que-ya-sabemos";
import { repiteLoSabido } from "./plan-de-la-guia";

/** Cómo se compara una pregunta con otra: sin espacios de más ni mayúsculas. */
export const normalizarPregunta = (t: string): string => t.trim().replace(/\s+/g, " ").toLowerCase();

export function problemaAlAgregar(o: {
  pregunta: string;
  /** El tema de la pregunta (una tarjeta o una dimensión), si lo tiene. */
  tema?: string;
  /** Las preguntas de la guía como las ve el vendedor (ya ajustadas). */
  preguntas: readonly Pick<PreguntaParaMostrar, "pregunta" | "tipo">[];
  /** Las que ya se sumaron en esta misma lista (normalizadas). */
  enLaLista: ReadonlySet<string>;
  saber: SaberDelCliente | null | undefined;
}): string | null {
  const nueva = normalizarPregunta(o.pregunta);
  if (o.preguntas.some((p) => normalizarPregunta(p.pregunta) === nueva)) return "Esa pregunta ya está en la guía.";
  if (o.enLaLista.has(nueva)) return "Esa pregunta ya está en esta lista.";
  const sumadas = o.preguntas.filter((p) => p.tipo === "propia").length + o.enLaLista.size;
  if (sumadas >= MAX_PREGUNTAS_PROPIAS) {
    return o.enLaLista.size
      ? `Con ${o.enLaLista.size === 1 ? "la que ya está" : `las ${o.enLaLista.size} que ya están`} en esta lista, la guía llega a ${MAX_PREGUNTAS_PROPIAS} preguntas sumadas (tuyas o del asistente), el máximo: no entra otra.`
      : AVISO_DEL_TOPE_DE_SUMADAS;
  }
  // Una pregunta sumada no tiene paso: se mira como una que va más allá de la situación (la regla deja pasar la
  // situación). Sin tema no hay con qué comparar, igual que al cambiar.
  if (o.tema && o.saber && repiteLoSabido(o.pregunta, { para: o.tema, paso: "impacto" }, o.saber)) {
    return "Vuelve a preguntar algo que el cliente ya dijo: pregunta lo que sigue.";
  }
  return null;
}
