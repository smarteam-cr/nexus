/**
 * lib/tareas/fila-de-cambios.ts — los cambios de una tarea desde la pantalla, en fila y con la versión que dejó el
 * anterior. CLIENT-SAFE y puro (2026-10-19; DECISIONS «Tareas internas…» › «Marcar hecha al instante»).
 *
 * El escritor único (lib/tareas/mutaciones.ts) responde 409 si la versión que manda la pantalla no es la de la base. Antes,
 * cada pantalla mandaba la versión de la tarea que tenía pintada, y esa versión se ponía al día recién con la recarga
 * entera de la lista (unos 2,5 s después de que el servidor respondía). Un segundo clic en ese rato —deshacer, o volver a
 * marcar porque no se veía el cambio— salía con la versión vieja y decía «Otra persona cambió esta tarea» aunque nadie
 * más la había tocado. Ahora:
 *   · cada respuesta anota la versión nueva de la tarea, y el próximo cambio sale con la más nueva que se conozca;
 *   · dos cambios sobre la misma tarea van uno detrás del otro, nunca a la vez.
 * Tomar la más nueva no esconde un cambio ajeno: la versión anotada salió de la base después de un cambio nuestro, así que
 * si otra persona la cambió después, la base igual va adelante y el 409 sale como debe.
 */
import type { AccionesDeTarea } from "./estados";

export interface FilaDeCambios {
  /** La versión con la que se manda un cambio: la que tiene la pantalla o, si es más nueva, la última que respondió el servidor. */
  version(id: string, deLaPantalla: number): number;
  /** Anota la versión que devolvió el servidor. Nunca la baja. */
  anotar(id: string, version: number): void;
  /** Olvida lo anotado (un cambio que no devuelve la tarea: la versión sale de la próxima carga). */
  olvidar(id: string): void;
  /** Corre `fn` cuando terminó todo lo que estaba en fila para esa tarea. Si `fn` falla, lo que viene detrás corre igual. */
  enFila<T>(id: string, fn: () => Promise<T>): Promise<T>;
  /** Cuántos cambios esperan respuesta (de todas las tareas). */
  pendientes(): number;
}

export function crearFilaDeCambios(): FilaDeCambios {
  const versiones = new Map<string, number>();
  const colas = new Map<string, Promise<unknown>>();
  let enVuelo = 0;
  return {
    version(id, deLaPantalla) {
      const v = versiones.get(id);
      return v !== undefined && v > deLaPantalla ? v : deLaPantalla;
    },
    anotar(id, version) {
      const v = versiones.get(id);
      if (v === undefined || version > v) versiones.set(id, version);
    },
    olvidar(id) {
      versiones.delete(id);
    },
    enFila<T>(id: string, fn: () => Promise<T>): Promise<T> {
      enVuelo++;
      const anterior = colas.get(id) ?? Promise.resolve();
      const p = anterior.then(fn, fn).finally(() => {
        enVuelo--;
      });
      const cola = p.catch(() => undefined);
      colas.set(id, cola);
      void cola.then(() => {
        if (colas.get(id) === cola) colas.delete(id);
      });
      return p;
    },
    pendientes: () => enVuelo,
  };
}

/* ── Al instante: la casilla cambia antes de que responda el servidor ─────────────────────────────────────────── */

export type EstadoQueSeMarca = "pendiente" | "en_curso" | "hecha";

/**
 * La tarea como queda en pantalla al marcarla, antes de que responda el servidor. Lo que se puede hacer con ella se
 * ajusta lo justo para poder deshacerlo enseguida: quien la podía terminar la puede reabrir, y al revés (las dos son
 * «manda» en `accionesDe`). Lo demás se pone al día con la próxima carga.
 */
export function conEstadoAlInstante<T extends { estado: string; acciones: AccionesDeTarea }>(t: T, hacia: EstadoQueSeMarca): T {
  const manda = t.acciones.terminar || t.acciones.reabrir;
  return {
    ...t,
    estado: hacia,
    acciones: {
      ...t.acciones,
      terminar: hacia !== "hecha" && manda,
      reabrir: hacia === "hecha" && manda,
      empezar: hacia === "pendiente" && manda,
    },
  };
}

/** Hacia dónde va el círculo de una fila: una hecha se reabre, una abierta se termina. */
export function haciaDelCirculo(estado: string): EstadoQueSeMarca {
  return estado === "hecha" ? "pendiente" : "hecha";
}
