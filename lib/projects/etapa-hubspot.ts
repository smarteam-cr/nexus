/**
 * lib/projects/etapa-hubspot.ts — QUÉ ETAPA PUEDE PROPONER NEXUS, Y CUÁL NO.
 *
 * ── EL PEDIDO ────────────────────────────────────────────────────────────────
 * Elías (2026-08-16): «es MUY posible que muchas de las etapas actuales de los proyectos en
 * HubSpot estén desactualizadas. Con lo que detecte Nexus debe sugerir un cambio de etapa, y con
 * un clic que se envíe a HubSpot».
 *
 * ── LOS TRES RIESGOS PROPIOS DE LA ETAPA ─────────────────────────────────────
 *
 * 1. ⛔ **CIRCULARIDAD.** La etapa es el «ancla #1» del cronograma vivo: `regenerate-progress` la
 *    usa para ubicar dónde va el avance. Si Nexus propusiera la etapa a PARTIR del avance que
 *    infirió, y después usara esa etapa para inferir el avance, el sistema se estaría confirmando
 *    a sí mismo — y cada corrida haría la mentira más firme. Por eso este módulo **no acepta el
 *    avance como evidencia**: la propuesta se construye desde hechos que no dependen de la etapa
 *    (un gate marcado, un documento publicado, un entregable aceptado).
 *
 * 2. ⚠ **RADIO DE EXPLOSIÓN.** Cambiar la etapa mueve la tarjeta de columna en el tablero que
 *    mira todo el equipo. Es más visible que el estado, así que la propuesta viaja SIEMPRE con
 *    las dos puntas —de dónde a dónde— para que quien acepta sepa qué va a ver el resto.
 *
 * 3. ⛔ **EL ID NUNCA SE INVENTA.** Sale de `def.stages` del pipeline de ESE proyecto. Los tres
 *    pipelines tienen ids distintos para etapas que se llaman igual («Handoff» es 1225193551 en
 *    Customer Success y 1409898886 en Development). Un id del pipeline equivocado manda el
 *    registro a una columna que no existe en su tablero.
 *
 * ── ESTO NO CONTRADICE «HUBSPOT MANDA LA ETAPA» (O1…O6) ──────────────────────
 * Manda para LEER: la propuesta se escribe *hacia* HubSpot y vuelve por el espejo. La fuente de
 * verdad no se mueve de lugar; lo único que cambia es que Nexus puede pedir el cambio.
 */
import { buscarEtapa, lineaDeAvance, type PipelineDef, type PipelineStage } from "./kind";

/** Lo que Nexus le sugiere a un humano sobre la etapa de un proyecto. */
export interface PropuestaDeEtapa {
  /** El id de HubSpot al que se movería. Siempre sale de `def.stages`. */
  stageId: string;
  /** Los dos rótulos, para que el aviso diga de dónde a dónde. */
  desde: string | null;
  hasta: string;
  /** Por qué, en una frase que se le muestra a la persona antes de que acepte. */
  motivo: string;
}

/**
 * ¿Se puede proponer mover este proyecto a esta etapa?
 *
 * Devuelve `null` —el caso más común y el correcto— cuando la etapa pedida no existe en ESE
 * pipeline, cuando ya está ahí, o cuando la etapa de destino es terminal.
 *
 * ⛔ **Nunca propone una etapa TERMINAL.** Mover un proyecto a «Finalizado» lo cierra: lo saca de
 * la cartera y toca cobranza. Es una decisión de negocio con las mismas consecuencias que escribir
 * `completed` en el estado, y tiene el mismo problema — no está resuelto cómo se deshace.
 */
export function proponerEtapa(
  def: PipelineDef,
  actualStageId: string | null | undefined,
  destinoStageId: string,
  motivo: string,
): PropuestaDeEtapa | null {
  const destino = buscarEtapa(def, destinoStageId);
  if (!destino) return null;
  if (def.closedStageIds.includes(destino.id)) return null;

  const actual = buscarEtapa(def, actualStageId);
  if (actual?.id === destino.id) return null;

  return {
    stageId: destino.id,
    desde: actual?.label ?? null,
    hasta: destino.label,
    motivo,
  };
}

/**
 * Las etapas a las que Nexus PUEDE mover un proyecto de este pipeline, en orden.
 *
 * Las terminales quedan afuera por lo de arriba. Se usa para poblar el selector del aviso: si el
 * CSE quiere corregir la sugerencia, elige de esta lista y no de un campo libre — así el id sigue
 * saliendo de la tabla congelada aunque la elección sea humana.
 */
export function etapasProponibles(def: PipelineDef): readonly PipelineStage[] {
  return lineaDeAvance(def).filter((s) => !def.closedStageIds.includes(s.id));
}

/**
 * ¿Cuánto se movería el proyecto, en pasos de la línea de avance?
 *
 * Sirve para el copy del aviso: «avanza 1 etapa» se acepta distinto que «avanza 4», y un salto
 * grande merece que alguien lo mire dos veces. Devuelve `null` si alguna de las dos no está en la
 * línea (p. ej. una etapa fuera del flujo normal).
 */
export function saltoDeEtapas(
  def: PipelineDef,
  desdeStageId: string | null | undefined,
  hastaStageId: string,
): number | null {
  const linea = lineaDeAvance(def);
  const i = linea.findIndex((s) => s.id === desdeStageId);
  const j = linea.findIndex((s) => s.id === hastaStageId);
  if (i < 0 || j < 0) return null;
  return j - i;
}
