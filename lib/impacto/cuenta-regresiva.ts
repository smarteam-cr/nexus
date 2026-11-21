/**
 * lib/impacto/cuenta-regresiva.ts — LA CUENTA REGRESIVA antes de rehacer un entregable (Elías, 21 nov). PURO y
 * client-safe (el reloj se inyecta: las pruebas lo controlan).
 *
 * «Esto cambia la página de La escala: <por qué>. La regenero en 10 s · Cancelar». Al llegar a 0 corre `alTerminar`
 * UNA vez; cancelar antes la apaga para siempre (no corre ni con un tic tardío). Cancelar no deshace nada de lo que ya se
 * guardó: la nota sigue. La usa el aviso de cualquier entregable (components/impacto/AvisoDeImpacto.tsx).
 */

export const SEGUNDOS_DE_LA_CUENTA = 10;

export type EstadoDeLaCuenta = "contando" | "corriendo" | "cancelada";

export interface Reloj {
  ahora: () => number;
  cadaSegundo: (fn: () => void) => () => void;
}

export interface CuentaRegresiva {
  estado: () => EstadoDeLaCuenta;
  /** Segundos que faltan (redondeado hacia arriba; 0 al terminar). */
  faltan: () => number;
  cancelar: () => void;
}

/**
 * Arranca la cuenta. `alCambiar` avisa cada segundo (para pintar) y al cambiar de estado. `alTerminar` corre una sola vez,
 * al llegar a 0, si nadie canceló.
 */
export function cuentaRegresiva(o: {
  segundos?: number;
  reloj: Reloj;
  alTerminar: () => void;
  alCambiar?: (faltan: number, estado: EstadoDeLaCuenta) => void;
}): CuentaRegresiva {
  const total = (o.segundos ?? SEGUNDOS_DE_LA_CUENTA) * 1000;
  const fin = o.reloj.ahora() + total;
  let estado: EstadoDeLaCuenta = "contando";
  const faltan = () => (estado === "contando" ? Math.max(0, Math.ceil((fin - o.reloj.ahora()) / 1000)) : 0);
  let parar: (() => void) | null = null;
  const tic = () => {
    if (estado !== "contando") return;
    const f = faltan();
    if (f > 0) {
      o.alCambiar?.(f, estado);
      return;
    }
    estado = "corriendo";
    parar?.();
    o.alCambiar?.(0, estado);
    o.alTerminar();
  };
  parar = o.reloj.cadaSegundo(tic);
  return {
    estado: () => estado,
    faltan,
    cancelar: () => {
      if (estado !== "contando") return;
      estado = "cancelada";
      parar?.();
      o.alCambiar?.(0, estado);
    },
  };
}

/** El reloj del navegador. */
export const relojDelNavegador: Reloj = {
  ahora: () => Date.now(),
  cadaSegundo: (fn) => {
    const id = setInterval(fn, 250);
    return () => clearInterval(id);
  },
};
