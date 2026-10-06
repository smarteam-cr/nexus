/**
 * lib/exploraciones/preparar-sola.ts — cuándo la pieza Preparación lanza SOLA la preparación y qué
 * dice de la última. PURO (lo usa la pantalla; se prueba en guardas.test.ts).
 *
 * Elías, 2026-10-05: «Si la preparación automática de una preventa falla, NO se reintenta sola al
 * volver a abrir: espera a que alguien apriete el botón. Y la pantalla dice cuándo se actualizó la
 * información por última vez.» Antes la pantalla decidía solo con las corridas que dejaron algo
 * guardado (`propuesta.corridas`, que anota las que terminaron bien): una preparación que fallaba no
 * quedaba en ningún lado y cada vez que se abría la pieza se lanzaba otra, que gastaba IA y volvía a
 * fallar. Y decidía al montar, antes de que el servidor contestara si ya había una corriendo.
 *
 * Ahora la decide lo que dice el SERVIDOR (GET /api/sales/exploraciones/[id]/agente: la última
 * corrida y la última preparación, del `AgentRun`), y sin su respuesta no se lanza nada.
 */
import type { CorridaEnCurso } from "./seguimiento-de-corrida";

/**
 * Desde cuándo «preparar» investiga en internet y propone el «por qué ahora», la radiografía, la
 * hipótesis de valor y la estrategia de conexión. Una exploración que no se preparó desde entonces
 * se prepara sola la primera vez que se abre la pieza (Elías, 2026-10-03: «todo de forma sugerida»).
 */
export const PREPARAR_CON_RADIOGRAFIA_DESDE = "2026-10-02T00:00:00.000Z";

/** Lo que contesta el servidor al abrir la pieza: la última corrida (cualquiera) y la última de preparar. */
export interface CorridasAlAbrir {
  corrida: CorridaEnCurso | null;
  preparacion: CorridaEnCurso | null;
}

/**
 * La última preparación de la que se sabe: la que dijo el servidor al abrir o la que se siguió
 * después en esta pantalla (la del seguimiento compartido, si es de preparar), la más nueva.
 */
export function ultimaPreparacion(alAbrir: CorridaEnCurso | null | undefined, enVivo: CorridaEnCurso | null): CorridaEnCurso | null {
  const viva = enVivo?.modo === "preparar" ? enVivo : null;
  if (!alAbrir) return viva;
  if (!viva) return alAbrir;
  return viva.empezo >= alAbrir.empezo ? viva : alAbrir;
}

export interface EstadoDeLaPreparacion {
  /** Cuándo se actualizó la información por última vez: la última preparación que terminó bien. */
  actualizadaEn: string | null;
  /** La última preparación falló (y no hubo una buena después): cuándo y por qué. */
  fallo: { en: string; error: string | null } | null;
}

/**
 * Lo que dice la pieza de la última preparación. `preparadaEn` es la última que terminó bien
 * (`propuesta.corridas`, se escribe al guardar lo propuesto); `ultima`, la última que se lanzó. Una
 * corrida empieza después de que terminó la anterior (hay una a la vez), así que la que falló es la
 * última solo si empezó después de la buena.
 */
export function estadoDeLaPreparacion(o: { preparadaEn: string | null; ultima: CorridaEnCurso | null }): EstadoDeLaPreparacion {
  const u = o.ultima;
  const fallo = u && u.estado === "ERROR" && (o.preparadaEn === null || u.empezo > o.preparadaEn) ? { en: u.termino ?? u.empezo, error: u.error } : null;
  return { actualizadaEn: o.preparadaEn, fallo };
}

/**
 * ¿La pieza lanza la preparación sola? Solo si la exploración no se preparó con la radiografía, se
 * puede editar y no está archivada, y el servidor ya contestó que no hay nada corriendo y que la
 * última preparación NO falló. ⛔ Una que falló espera a que alguien apriete el botón.
 */
export function debePrepararSola(o: {
  puedeEditar: boolean;
  archivada: boolean;
  /** Cuándo terminó bien la última preparación (`propuesta.corridas`), o null si nunca. */
  preparadaEn: string | null;
  /** undefined: el servidor todavía no contestó; null: no se pudo consultar. */
  alAbrir: CorridasAlAbrir | null | undefined;
  /** El seguimiento compartido ve una corrida viva, o alguien la está lanzando. */
  ocupado: boolean;
}): boolean {
  if (!o.puedeEditar || o.archivada || o.ocupado) return false;
  if (o.preparadaEn !== null && o.preparadaEn >= PREPARAR_CON_RADIOGRAFIA_DESDE) return false;
  // Sin la respuesta del servidor no se decide: puede haber una corriendo, o la última puede haber fallado.
  if (!o.alAbrir) return false;
  if (o.alAbrir.corrida?.estado === "RUNNING" || o.alAbrir.preparacion?.estado === "RUNNING") return false;
  if (estadoDeLaPreparacion({ preparadaEn: o.preparadaEn, ultima: o.alAbrir.preparacion }).fallo) return false;
  return true;
}
