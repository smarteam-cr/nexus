/**
 * lib/tests-diagnostico/iman-del-radar.test.ts — el imán del radar acerca cada punto al cursor, nunca lo aleja, nunca más
 * que su amplitud, y responde (con el piso) aunque el cursor esté lejos.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("cerca, casi toda la amplitud; lejos, el piso; nunca más que la amplitud", () => {
    expect(largo(imanHacia(0, 0, 60, 0, 7, 480))).toBeCloseTo(7 * (IMAN.piso + (1 - IMAN.piso) * (1 - 60 / 480) ** 2), 5);
    expect(largo(imanHacia(0, 0, 2000, 0, 7, 480))).toBeCloseTo(7 * IMAN.piso, 5);
    for (const dist of [1, 50, 200, 479, 480, 5000]) expect(largo(imanHacia(0, 0, dist, 0, 7, 480))).toBeLessThanOrEqual(7);
  });

  it("⛔ al cruzar el cursor por encima del punto no hay salto: el tirón se apaga y nunca lo pasa de largo", () => {
    // Elías, 30 oct: con una fuerza fija, el vértice brincaba 11 px en un cuadro al cruzar el cursor.
    let antes = imanHacia(0, 0, -60, 5, 7, 480);
    for (let x = -60; x <= 60; x += 2) {
      const ahora = imanHacia(0, 0, x, 5, 7, 480);
      expect(Math.hypot(ahora.x - antes.x, ahora.y - antes.y), `cursor en ${x}`).toBeLessThan(1);
      // El punto corrido sigue del mismo lado del cursor.
      expect(Math.abs(ahora.x)).toBeLessThanOrEqual(Math.abs(x));
      antes = ahora;
    }
  });

  it("⛔ tampoco salta con el mouse a velocidad normal: cruzando a 1500 px por segundo avanza menos de 4 px por cuadro", () => {
    // Igual que el cuadro a cuadro de la página: el cursor suavizado cruza el punto y el tirón se calcula con él.
    const velocidad = 1500 / 60;
    let m = -600;
    let antes = imanHacia(0, 0, m, 5, 7, 480);
    let cruzo = false;
    for (let cuadro = 0; cuadro < 80; cuadro++) {
      m += (-600 + velocidad * cuadro - m) * IMAN.suavizado;
      const ahora = imanHacia(0, 0, m, 5, 7, 480);
      expect(Math.hypot(ahora.x - antes.x, ahora.y - antes.y), `cuadro ${cuadro}`).toBeLessThan(4);
      cruzo ||= m > 0;
      antes = ahora;
    }
    expect(cruzo).toBe(true);
  });

  it("⛔ la línea y el vértice se mueven como una sola pieza: crecen y se encogen con la misma duración y curva, sin filtro que salte", () => {
    const css = readFileSync(join(process.cwd(), "components/escala/radar-de-una-empresa.css"), "utf8").replace(/\r\n/g, "\n");
    const entrada = (selector: string) => css.split("\n").find((l) => l.startsWith(selector))!;
    const linea = entrada(".rde-eje-resalte.is-activa {").match(/stroke-dashoffset (\.\d+s cubic-bezier\([^)]*\))/)![1];
    const vertice = entrada(".rde-interactivo .rde-vertice.is-activa {");
    expect(vertice).toContain(`transform ${linea}`);
    expect(vertice).not.toContain("filter");
    const lineaQueSeVa = entrada(".rde-eje-resalte {").match(/stroke-dashoffset (\.\d+s [a-z-]+)/)![1];
    const verticeQueSeVa = entrada(".rde-interactivo .rde-vertice {");
    expect(verticeQueSeVa).toContain(`transform ${lineaQueSeVa}`);
    expect(verticeQueSeVa).not.toContain("filter");
    // Con «reducir movimiento» tampoco se anima: la regla del activo es más fuerte, tiene que estar en la lista.
    const reducir = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducir).toContain(".rde-interactivo .rde-vertice.is-activa");
  });

  it("con el cursor encima del punto exacto, no se mueve (sin dividir por cero)", () => {
    expect(imanHacia(10, 10, 10, 10, 7, 480)).toEqual({ x: 0, y: 0 });
  });
});
