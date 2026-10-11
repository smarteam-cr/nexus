/**
 * lib/tareas/chat/vista.ts — el hilo del chat de tareas como lo pinta el cajón. SERVIDOR.
 *
 * La misma vista que el resto del chat (`aVista`: el estado de cada acuerdo derivado sobre el hilo ENTERO), con un
 * tope de turnos: el hilo de tareas es uno por persona y para siempre, y el cajón no pinta cientos de mensajes.
 */
import "server-only";
import { aVista } from "@/lib/asistente/handler";
import type { HiloConTurnos } from "@/lib/asistente/hilo";

export const TURNOS_A_LA_VISTA = 60;

export function vistaDelHilo(hilo: HiloConTurnos | null) {
  const v = aVista(hilo);
  if (!v.hilo) return v;
  return { hilo: { ...v.hilo, turnos: v.hilo.turnos.slice(-TURNOS_A_LA_VISTA) } };
}
