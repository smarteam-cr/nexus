/**
 * lib/ui/toast-duracion.ts — cuánto vive un toast en pantalla.
 *
 * Vive acá y no dentro del componente para poder probarlo: la regla de negocio es una tabla,
 * y una tabla que nadie puede ejecutar en un test se desalinea sola.
 *
 * ⛔ LA REGLA QUE GOBIERNA TODO: NINGÚN TOAST ES ETERNO.
 *
 * Antes, un toast con `action` se declaraba sticky «para que el usuario alcance a clickearla».
 * El razonamiento tenía sentido y el resultado no: los avisos de agente terminado traen un
 * «Ver», así que ninguno se iba, y se apilaban seis tapando la pantalla hasta que alguien los
 * cerraba a mano de a uno. Un aviso que hay que cerrar a mano dejó de ser un aviso: es trabajo.
 *
 * Lo que reemplaza al sticky es la PAUSA AL PASAR EL MOUSE (ver `ToastProvider`): si estás
 * leyéndolo o yendo a clickearlo, el reloj se detiene. Eso da la garantía que el sticky
 * buscaba —no se te escapa lo que estás mirando— sin dejar basura en pantalla cuando no.
 */

export type ToastType = "success" | "error" | "info";

/**
 * Tiempo base por tipo. Un error se lee más despacio que un «Listo», y una confirmación de
 * algo que el usuario acaba de hacer casi no necesita leerse: ya sabe qué pasó.
 */
export const DURACION_BASE: Record<ToastType, number> = {
  success: 5000,
  info: 7000,
  error: 10000,
};

/** Con acción, el doble: hay que leer Y llegar a apretar. Más tiempo, no tiempo infinito. */
export const FACTOR_CON_ACCION = 2;

/**
 * Techo absoluto, y lo que significa `duration: 0`.
 *
 * `0` solía querer decir «no se cierra nunca». Ahora quiere decir «lo máximo que damos»: los
 * dos lugares que lo piden —una alerta CS de severidad alta y el error de scope de HubSpot—
 * quieren insistencia, no permanencia. Si algo de verdad no puede perderse, el canal correcto
 * es su panel, no un toast: el toast es para enterarse, no para archivar.
 */
export const DURACION_MAXIMA = 30000;

/** Cuántos se ven a la vez. El resto se descarta por el más viejo — seis apilados tapan la app. */
export const MAX_VISIBLES = 3;

/**
 * Cuánto vive este toast, en ms. SIEMPRE un número finito y positivo.
 *
 * @param duration lo que pidió quien lo emitió. `0` = el máximo (ver arriba).
 */
export function duracionDeToast(
  type: ToastType,
  opts?: { duration?: number; conAccion?: boolean },
): number {
  if (opts?.duration === 0) return DURACION_MAXIMA;
  if (typeof opts?.duration === "number" && opts.duration > 0) {
    return Math.min(opts.duration, DURACION_MAXIMA);
  }
  const base = DURACION_BASE[type] * (opts?.conAccion ? FACTOR_CON_ACCION : 1);
  return Math.min(base, DURACION_MAXIMA);
}
