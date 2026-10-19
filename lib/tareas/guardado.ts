/**
 * lib/tareas/guardado.ts — qué dice el cajón de una tarea sobre si lo escrito quedó. CLIENT-SAFE y puro.
 *
 * El cajón guarda solo (cada cambio va por el escritor único, lib/tareas/mutaciones.ts), pero no lo decía: no había
 * botón ni señal, y no se sabía si el texto había quedado (Elías y Alex Vanegas, 2026-10-19). Se eligió seguir
 * guardando solo y decirlo, como «Tus notas» de la agenda: el título y las notas se guardan a los 0,9 s de dejar de
 * escribir, al salir del campo y al cerrar el cajón; lo demás, al elegirlo. Un botón «Guardar» obligaba a acordarse
 * de apretarlo en un cajón donde casi todo (estado, semana, responsable) ya se guarda al tocarlo.
 */

export type EstadoDelGuardado = "listo" | "sin_guardar" | "guardando" | "guardado" | "error";

export const ESPERA_AL_ESCRIBIR_MS = 900;

/**
 * El estado que se muestra. `pendientes` = campos con texto que todavía no se mandó; `enVuelo` = pedidos sin respuesta;
 * `error` = el último pedido falló; `guardadoAlguna` = se guardó algo desde que se abrió el cajón.
 */
export function estadoDelGuardado(s: { pendientes: number; enVuelo: number; error: boolean; guardadoAlguna: boolean }): EstadoDelGuardado {
  if (s.enVuelo > 0) return "guardando";
  if (s.error) return "error";
  if (s.pendientes > 0) return "sin_guardar";
  return s.guardadoAlguna ? "guardado" : "listo";
}

export const TEXTO_DEL_GUARDADO: Record<EstadoDelGuardado, string> = {
  listo: "Los cambios se guardan solos",
  sin_guardar: "Sin guardar…",
  guardando: "Guardando…",
  guardado: "Guardado",
  error: "No se pudo guardar",
};
