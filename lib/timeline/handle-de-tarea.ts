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

/**
 * E3 P4: los handles de un contexto con una PROPUESTA abierta, sin choques entre sí.
 *
 * Con una propuesta, las tareas que el chat nombra no son solo las vivas: también las nuevas, que se
 * nombran por su clave (`t:` + un UUID). El final de un UUID es hexadecimal —16 símbolos por lugar y
 * no 36—, así que con 5 caracteres dos nuevas chocan más seguido: con 250 claves, ~3 % de las veces.
 * `resolverHandle` rechaza un handle ambiguo (bien), pero un handle que el contexto IMPRIME tiene que
 * resolver siempre a su tarea: si no, el chat no podría nombrarla nunca.
 *
 * Cada ref arranca con los últimos `LARGO_DEL_HANDLE` caracteres y se alarga SOLO si otra ref termina
 * igual (sin mayúsculas, como compara `resolverHandle`). Una ref que es el final de otra se nombra
 * entera: `resolverHandle` gana por el id exacto. Las demás, las que no chocan, quedan como hoy.
 */
export function handlesSinChoque(refs: Iterable<string>): Map<string, string> {
  const todas = [...new Set(refs)].filter((r) => r.trim().length > 0);
  const minusculas = todas.map((r) => r.toLowerCase());
  const handles = new Map<string, string>();
  todas.forEach((ref, i) => {
    const propia = minusculas[i];
    let largo = Math.min(LARGO_DEL_HANDLE, ref.length);
    while (largo < ref.length) {
      const fin = propia.slice(-largo);
      if (!minusculas.some((otra, j) => j !== i && otra.endsWith(fin))) break;
      largo++;
    }
    handles.set(ref, ref.slice(-largo));
  });
  return handles;
}
