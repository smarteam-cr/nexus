/** La cuenta regresiva (./cuenta-regresiva.ts): corre una vez al llegar a 0, y cancelada no corre nunca. */
import { describe, expect, it, vi } from "vitest";
import { cuentaRegresiva, type Reloj } from "./cuenta-regresiva";

/** Un reloj de mentira: el tiempo avanza a mano y cada avance hace un tic. */
function relojFalso() {
  let t = 0;
  let tic: (() => void) | null = null;
  const reloj: Reloj = {
    ahora: () => t,
    cadaSegundo: (fn) => {
      tic = fn;
      return () => {
        tic = null;
      };
    },
  };
  return {
    reloj,
    avanzar: (ms: number) => {
      t += ms;
      tic?.();
    },
    vivo: () => tic !== null,
  };
}

describe("la cuenta regresiva", () => {
  it("cuenta de 10 a 0 y corre UNA vez", () => {
    const r = relojFalso();
    const alTerminar = vi.fn();
    const vistos: number[] = [];
    const c = cuentaRegresiva({ reloj: r.reloj, alTerminar, alCambiar: (f, e) => e === "contando" && vistos.push(f) });
    expect(c.faltan()).toBe(10);
    r.avanzar(3000);
    expect(c.faltan()).toBe(7);
    expect(alTerminar).not.toHaveBeenCalled();
    r.avanzar(7000);
    expect(alTerminar).toHaveBeenCalledTimes(1);
    expect(c.estado()).toBe("corriendo");
    expect(r.vivo()).toBe(false);
    r.avanzar(5000);
    expect(alTerminar).toHaveBeenCalledTimes(1);
    expect(vistos).toEqual([7]);
  });

  it("cancelada no corre, ni con un tic tardío", () => {
    const r = relojFalso();
    const alTerminar = vi.fn();
    const c = cuentaRegresiva({ reloj: r.reloj, alTerminar });
    r.avanzar(4000);
    c.cancelar();
    expect(c.estado()).toBe("cancelada");
    expect(r.vivo()).toBe(false);
    r.avanzar(20_000);
    expect(alTerminar).not.toHaveBeenCalled();
    expect(c.faltan()).toBe(0);
  });

  it("cancelar después de correr no hace nada", () => {
    const r = relojFalso();
    const alTerminar = vi.fn();
    const c = cuentaRegresiva({ segundos: 2, reloj: r.reloj, alTerminar });
    r.avanzar(2000);
    c.cancelar();
    expect(c.estado()).toBe("corriendo");
    expect(alTerminar).toHaveBeenCalledTimes(1);
  });
});
