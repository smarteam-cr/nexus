/**
 * lib/timeline/handle-de-tarea.ts — CÓMO SE NOMBRA UNA TAREA EN LA CONVERSACIÓN.
 *
 * PURO. Sin Prisma, sin red, sin React.
 *
 * ── EL PROBLEMA, Y POR QUÉ NO ALCANZABA CON MANDAR EL ID ─────────────────────────────────────
 * El chat del cronograma tiene `tarea.mover-semana`, `tarea.mover-fase` y `tarea.borrar` en su
 * vocabulario desde el 2026-08-20 — y nunca pudo emitir ninguna, porque el contexto no le manda
 * ni un id ni un título (`lib/asistente/contexto.ts`). El CSE lo vio de frente:
 *
 *   *«Haz que integraciones tenga 3 semanas, deja todas las tareas atrasadas en la 3ra semana»*
 *   → «No tengo forma de identificar cuáles tareas están atrasadas…»
 *
 * Era cierto. El arreglo es mandarle las tareas. Lo que cuesta caro es el ID: un cuid son 25
 * caracteres, y el prefijo del chat tiene techo.
 *
 * ── ⛔ Y POR QUÉ EL PREFIJO DEL CUID SERÍA UN DESASTRE (medido, 2026-08-21) ───────────────────
 * Sobre las 1.317 tareas de los 51 cronogramas reales, contando cuántas comparten el mismo tramo:
 *
 *   | tramo | PRIMEROS n caracteres | ÚLTIMOS n caracteres |
 *   |-------|-----------------------|----------------------|
 *   |   4   |      1.306 colisiones |          0 colisiones|
 *   |   8   |      1.063 colisiones |          0 colisiones|
 *
 * No es casualidad: un cuid arranca con marca de tiempo + contador, y las tareas de un cronograma
 * nacen todas en el mismo `createMany`. **El principio del id es casi idéntico entre hermanas; el
 * final es el bloque aleatorio.** Un handle por prefijo habría apuntado a la tarea equivocada de
 * forma sistemática — rápido, silencioso y equivocado, que es el modo de falla que este módulo
 * y `operaciones.ts` existen para impedir.
 *
 * Se toman 5 y no 4 por margen: con 4 hoy ya alcanza (cero colisiones sobre 1.317), pero el
 * cronograma más grande tiene 98 tareas y la cartera crece. 36^5 son 60 millones de
 * combinaciones; el riesgo de choque con 100 tareas es ~0,008 %.
 *
 * ── ⭐ Y CUANDO CHOQUEN, SE RECHAZA ──────────────────────────────────────────────────────────
 * La probabilidad no es cero, así que el comportamiento ante un choque es parte del diseño y no
 * un accidente: `resolverHandle` devuelve `ambigua` y quien la llama RECHAZA con motivo. Nunca
 * elige la primera. Es la misma regla que gobierna el vocabulario cerrado: una operación que no
 * coincide con la intención es peor que una que no se pudo ejecutar.
 */

/** Cuántos caracteres del final del id forman el handle. Ver la tabla de colisiones del docblock. */
export const LARGO_DEL_HANDLE = 5;

/** El handle de una tarea: los últimos caracteres de su id, que es donde vive lo aleatorio. */
export function handleDeTarea(id: string): string {
  return id.slice(-LARGO_DEL_HANDLE);
}

export type ResolucionDeHandle =
  | { tipo: "una"; id: string }
  | { tipo: "ninguna" }
  | { tipo: "ambigua"; cuantas: number };

/**
 * Traduce lo que dijo el chat a un id real.
 *
 * ⚠ Acepta también el id COMPLETO, y a propósito: el handle es una comodidad para que el
 * cronograma entre en el prefijo, no un formato nuevo que invalide lo anterior. Un acuerdo
 * guardado antes de este cambio trae cuids enteros y tiene que seguir aplicándose igual.
 */
export function resolverHandle(
  referencia: string,
  idsExistentes: readonly string[],
): ResolucionDeHandle {
  const ref = referencia.trim();
  if (!ref) return { tipo: "ninguna" };

  /* El id completo gana siempre: es exacto y no necesita desempate. */
  if (idsExistentes.includes(ref)) return { tipo: "una", id: ref };

  const buscado = ref.toLowerCase();
  const coinciden = idsExistentes.filter((id) => id.toLowerCase().endsWith(buscado));
  if (coinciden.length === 1) return { tipo: "una", id: coinciden[0] };
  if (coinciden.length === 0) return { tipo: "ninguna" };
  return { tipo: "ambigua", cuantas: coinciden.length };
}
