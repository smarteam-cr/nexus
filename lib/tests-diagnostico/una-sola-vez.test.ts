/**
 * lib/tests-diagnostico/una-sola-vez.test.ts — terminar un test no paga la IA dos veces, y el test público tiene su
 * propio tope de redacciones por hora.
 */
import { describe, expect, it, vi } from "vitest";
import { REDACCIONES_POR_HORA, TopeDeRedacciones, unaSolaVez } from "./una-sola-vez";

describe("terminar una sola vez", () => {
  it("⛔ dos pedidos seguidos del mismo test corren una sola vez y reciben la misma dirección", async () => {
    const enCurso = new Map<string, Promise<string>>();
    let soltar: (x: string) => void = () => undefined;
    const fn = vi.fn(() => new Promise<string>((r) => (soltar = r)));
    const a = unaSolaVez(enCurso, "tok", fn);
    const b = unaSolaVez(enCurso, "tok", fn);
    expect(fn).toHaveBeenCalledTimes(1);
    soltar("/resultado/tok");
    await expect(Promise.all([a, b])).resolves.toEqual(["/resultado/tok", "/resultado/tok"]);
    expect(enCurso.size).toBe(0);
  });

  it("otro test corre aparte, y uno que falló se puede volver a intentar", async () => {
    const enCurso = new Map<string, Promise<string>>();
    await expect(unaSolaVez(enCurso, "a", () => Promise.reject(new Error("no")))).rejects.toThrow("no");
    const fn = vi.fn(() => Promise.resolve("ok"));
    await unaSolaVez(enCurso, "a", fn);
    await unaSolaVez(enCurso, "b", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("el tope de redacciones por hora", () => {
  it("deja pasar las de la hora y frena la siguiente; una hora después, vuelve a dejar", () => {
    const tope = new TopeDeRedacciones();
    const t0 = Date.UTC(2026, 9, 29, 12);
    for (let i = 0; i < REDACCIONES_POR_HORA; i++) expect(tope.permitir(t0 + i)).toBe(true);
    expect(tope.permitir(t0 + 1000)).toBe(false);
    expect(tope.permitir(t0 + 60 * 60 * 1000 + REDACCIONES_POR_HORA)).toBe(true);
  });
});
