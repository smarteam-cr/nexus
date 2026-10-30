/**
 * lib/tests-diagnostico/iman-del-radar.test.ts — el imán del radar acerca cada punto al cursor, nunca lo aleja, nunca más
 * que su amplitud, y responde (con el piso) aunque el cursor esté lejos.
 */
import { describe, expect, it } from "vitest";
import { IMAN, imanHacia } from "./iman-del-radar";

const largo = (d: { x: number; y: number }) => Math.hypot(d.x, d.y);

describe("el imán del radar", () => {
  it("⛔ acerca el punto al cursor, nunca lo aleja", () => {
    for (const [mx, my] of [[100, 0], [-50, 30], [0, -400], [700, 700]]) {
      const d = imanHacia(0, 0, mx, my, 7, 480);
      expect(d.x * mx + d.y * my).toBeGreaterThan(0);
    }
  });

  it("pegado al cursor, toda la amplitud; lejos, el piso; nunca más que la amplitud", () => {
    expect(largo(imanHacia(0, 0, 1, 0, 7, 480))).toBeCloseTo(7 * (IMAN.piso + (1 - IMAN.piso) * (1 - 1 / 480) ** 2), 5);
    expect(largo(imanHacia(0, 0, 2000, 0, 7, 480))).toBeCloseTo(7 * IMAN.piso, 5);
    for (const dist of [1, 50, 200, 479, 480, 5000]) expect(largo(imanHacia(0, 0, dist, 0, 7, 480))).toBeLessThanOrEqual(7);
  });

  it("con el cursor encima del punto exacto, no se mueve (sin dividir por cero)", () => {
    expect(imanHacia(10, 10, 10, 10, 7, 480)).toEqual({ x: 0, y: 0 });
  });
});
