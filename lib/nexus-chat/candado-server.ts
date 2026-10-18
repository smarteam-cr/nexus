/**
 * lib/nexus-chat/candado-server.ts — UN candado por hilo para el turno y para aplicar. SERVER-ONLY.
 *
 * El turno lee lo pendiente del hilo y deja una lista nueva; aplicar lee la lista y escribe el desenlace. Si corren a la
 * vez sobre el mismo hilo, el turno puede volver a proponer lo que se acaba de aplicar (y aplicarlo dos veces), o aplicar
 * puede leer el hilo antes de que el turno escriba lo suyo. Por eso los dos toman el MISMO candado, y cada uno vuelve a
 * leer el hilo después de tomarlo.
 *
 * ⚠ Es EN MEMORIA (la app corre en una sola instancia, docs/RUNBOOK.md invariante #1). No es un `FOR UPDATE`: los
 * escritores de la capa abren su propia transacción y escribir el desenlace (`agregarTurno`) toca la fila del hilo, así
 * que una transacción abierta alrededor de todo se trabaría consigo misma.
 */
import "server-only";

const ocupados = new Set<string>();

/** Toma el candado del hilo. Devuelve cómo soltarlo, o `null` si ya lo tiene otro pedido. */
export function tomarHilo(hiloId: string): (() => void) | null {
  if (ocupados.has(hiloId)) return null;
  ocupados.add(hiloId);
  let suelto = false;
  return () => {
    if (suelto) return;
    suelto = true;
    ocupados.delete(hiloId);
  };
}
