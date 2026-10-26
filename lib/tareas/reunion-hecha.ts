/**
 * lib/tareas/reunion-hecha.ts — la reunión planeada (una tarea de clase «reunion») y la reunión de Meet que la cumplió
 * (P3 etapa 2, 2026-10-27). CLIENT-SAFE y puro; lo lee y lo escribe lib/tareas/reunion-hecha-server.ts.
 *
 * Hasta hoy nada escribía `Tarea.reunionHechaId`: la tarea «Reunión con kölbi del jueves» quedaba sin saber que la
 * reunión pasó. Ahora, cuando la reunión llega de Meet, se une a su tarea. Dos caminos, el más seguro primero:
 *
 *   1. La elegida del calendario («Ya la agendé»: `origenId` «elegida:<cuenta>:<evento>»): la sesión de ESE evento.
 *   2. Si no: la única reunión de la persona que empezó cerca de la hora planeada, de la MISMA cuenta (invariante 1: una
 *      reunión de otro cliente nunca se une) y con al menos uno de los invitados, si la tarea los tiene.
 *
 * Ante la duda (dos que calzan, o ninguna), no se une: lo que no se sabe no se inventa.
 */
import { PREFIJO_DE_LA_ELEGIDA } from "./reunion-elegida";

/** Cuánto se puede correr una reunión de la hora planeada y seguir siendo ella. */
export const MINUTOS_DE_MARGEN = 45;
/** Hasta cuántos días después de la hora planeada se busca la reunión (las notas de Gemini tardan; Meet copia cada 10 min). */
export const DIAS_PARA_UNIRLA = 3;

export interface ReunionPlaneada {
  origenId: string | null;
  clientId: string | null;
  reunionInicio: Date;
  invitados: readonly string[];
}

export interface ReunionDeMeet {
  id: string;
  inicio: Date;
  participantes: readonly string[];
  duenoClienteId: string | null;
  puertasAdentro: boolean;
}

/** El id del evento de una reunión elegida del calendario («elegida:<cuenta>:<evento>»), o null. */
export function eventoDeLaElegida(origenId: string | null | undefined): string | null {
  if (!origenId?.startsWith(PREFIJO_DE_LA_ELEGIDA)) return null;
  const resto = origenId.slice(PREFIJO_DE_LA_ELEGIDA.length);
  const i = resto.indexOf(":");
  const evento = i >= 0 ? resto.slice(i + 1) : "";
  return evento || null;
}

/** La sesión de Meet de un evento de Calendar: Nexus la guarda como «gmeet_<evento>». */
export const sesionDelEvento = (eventoId: string) => `gmeet_${eventoId}`;

/** La reunión de Meet que cumplió la planeada, o null si no hay una sola que calce. */
export function reunionHechaDe(p: ReunionPlaneada, candidatas: readonly ReunionDeMeet[]): string | null {
  // Con cuenta, una reunión de ESA cuenta (con alguien de afuera); sin cuenta, solo una de puertas adentro.
  const deLaCuenta = (r: ReunionDeMeet) => (p.clientId ? !r.puertasAdentro && r.duenoClienteId === p.clientId : r.puertasAdentro);
  const evento = eventoDeLaElegida(p.origenId);
  if (evento) {
    const exacta = candidatas.find((r) => r.id === sesionDelEvento(evento));
    if (exacta) return deLaCuenta(exacta) ? exacta.id : null;
  }
  const invitados = new Set(p.invitados.map((x) => x.toLowerCase()));
  const calzan = candidatas.filter(
    (r) =>
      Math.abs(+r.inicio - +p.reunionInicio) <= MINUTOS_DE_MARGEN * 60_000 &&
      deLaCuenta(r) &&
      (invitados.size === 0 || r.participantes.some((x) => invitados.has(x.toLowerCase()))),
  );
  return calzan.length === 1 ? calzan[0]!.id : null;
}
