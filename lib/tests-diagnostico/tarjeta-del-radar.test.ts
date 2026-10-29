/**
 * lib/tests-diagnostico/tarjeta-del-radar.test.ts — la tarjeta de una dimensión del radar nunca tapa la dimensión que se
 * mira: en pantallas anchas va del lado contrario del radar; en angostas, en la otra mitad de la pantalla.
 */
import { describe, expect, it } from "vitest";
import { ANCHO_PARA_IR_AL_COSTADO, LIBRE, posicionDeLaTarjeta } from "./tarjeta-del-radar";

const tapa = (t: { left: number; top: number }, w: number, h: number, x: number, y: number) => x >= t.left && x <= t.left + w && y >= t.top && y <= t.top + h;

describe("dónde va la tarjeta del radar", () => {
  const ancha = { vw: 1440, vh: 1000, w: 420, h: 330, radar: { left: 30, right: 1410 } };

  it("en escritorio, del lado contrario de la dimensión y a la altura del puntero", () => {
    const derecha = posicionDeLaTarjeta({ ...ancha, x: 1000, y: 400, xDeLaDimension: 1000 });
    expect(derecha).toMatchObject({ left: 48, top: 235, angosta: false, altoMaximo: null });
    const izquierda = posicionDeLaTarjeta({ ...ancha, x: 400, y: 400, xDeLaDimension: 400 });
    expect(izquierda.left).toBe(1410 - 420 - 18);
    for (const [p, x] of [[derecha, 1000], [izquierda, 400]] as const) expect(tapa(p, 420, 330, x, 400)).toBe(false);
  });

  it("siempre dentro de la pantalla, aunque el puntero esté en el borde", () => {
    const p = posicionDeLaTarjeta({ ...ancha, x: 1000, y: 20, xDeLaDimension: 1000 });
    expect(p.top).toBe(8);
    const q = posicionDeLaTarjeta({ ...ancha, x: 1000, y: 990, xDeLaDimension: 1000 });
    expect(q.top + 330).toBeLessThanOrEqual(1000 - 8);
  });

  it("⛔ en tablet y teléfono, en la otra mitad de la pantalla: nunca tapa el dedo", () => {
    for (const vw of [375, 768, ANCHO_PARA_IR_AL_COSTADO - 1]) {
      const vh = 812;
      const w = Math.min(420, vw - 24);
      for (const y of [100, 300, 405, 406, 512, 700]) {
        const p = posicionDeLaTarjeta({ vw, vh, w, h: 591, x: vw / 2, y, radar: { left: 12, right: vw - 12 }, xDeLaDimension: vw / 2 });
        expect(p.angosta).toBe(true);
        const h = Math.min(591, p.altoMaximo!);
        // Ni el dedo ni la franja alrededor (el rótulo que tocó).
        for (const dy of [1 - LIBRE, 0, LIBRE - 1]) expect(tapa(p, w, h, vw / 2, y + dy), `vw ${vw}, y ${y}`).toBe(false);
        expect(p.top).toBeGreaterThanOrEqual(8);
        expect(p.top + h).toBeLessThanOrEqual(vh - 8);
        expect(p.left).toBeGreaterThanOrEqual(8);
      }
    }
  });
});
