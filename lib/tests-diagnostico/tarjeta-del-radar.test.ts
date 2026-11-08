/**
 * lib/tests-diagnostico/tarjeta-del-radar.test.ts — la tarjeta de una dimensión del radar va junto a ella y nunca la tapa:
 * en pantallas anchas, al costado de afuera del rótulo (o encima o debajo si ahí no cabe); en angostas, en la otra mitad
 * de la pantalla.
 */
import { describe, expect, it } from "vitest";
import {
  AIRE,
  alEntrarEnUnaPieza,
  ANCHO_PARA_IR_AL_COSTADO,
  distanciaALaCaja,
  ESPERA_AL_CRUZAR_MS,
  GRACIA_AL_SALIR_MS,
  GRACIA_PARA_LLEGAR_MS,
  LIBRE,
  posicionDeLaTarjeta,
  vaHaciaLaTarjeta,
  type Caja,
} from "./tarjeta-del-radar";

const tapa = (t: { left: number; top: number }, w: number, h: number, x: number, y: number) => x >= t.left && x <= t.left + w && y >= t.top && y <= t.top + h;
const seCruzan = (t: { left: number; top: number }, w: number, h: number, c: Caja) => t.left < c.right && t.left + w > c.left && t.top < c.bottom && t.top + h > c.top;

describe("dónde va la tarjeta del radar", () => {
  const radar: Caja = { left: 100, right: 1340, top: 200, bottom: 900 };
  const ancha = { vw: 1440, vh: 1000, w: 340, h: 170, radar };
  const rotuloEn = (left: number, top: number): Caja => ({ left, right: left + 150, top, bottom: top + 60 });

  it("con lugar, al costado de afuera del rótulo y a su altura: a la derecha las de la derecha, a la izquierda las de la izquierda", () => {
    const derecha = rotuloEn(800, 400);
    const p = posicionDeLaTarjeta({ ...ancha, x: 850, y: 420, rotulo: derecha });
    expect(p).toMatchObject({ left: 950 + AIRE, top: 430 - 85, angosta: false, altoMaximo: null });
    const izquierda = rotuloEn(500, 400);
    const q = posicionDeLaTarjeta({ ...ancha, x: 550, y: 420, rotulo: izquierda });
    expect(q.left + 340).toBe(500 - AIRE);
  });

  it("⛔ sin lugar al costado, encima en la mitad de arriba y debajo en la de abajo, pegada al rótulo", () => {
    const arriba = rotuloEn(120, 400);
    const p = posicionDeLaTarjeta({ ...ancha, x: 150, y: 420, rotulo: arriba });
    expect(p.top + 170).toBe(400 - AIRE);
    const abajo = rotuloEn(120, 700);
    const q = posicionDeLaTarjeta({ ...ancha, x: 150, y: 720, rotulo: abajo });
    expect(q.top).toBe(760 + AIRE);
  });

  it("⛔ nunca tapa el rótulo y siempre queda cerca, dentro de la pantalla", () => {
    for (const left of [110, 300, 640, 900, 1180]) {
      for (const top of [20, 200, 480, 760, 930]) {
        const rotulo = rotuloEn(left, top);
        const p = posicionDeLaTarjeta({ ...ancha, x: left + 50, y: top + 20, rotulo });
        expect(seCruzan(p, 340, 170, rotulo), `rótulo en ${left},${top}`).toBe(false);
        expect(p.left).toBeGreaterThanOrEqual(8);
        expect(p.left + 340).toBeLessThanOrEqual(1432);
        expect(p.top).toBeGreaterThanOrEqual(8);
        expect(p.top + 170).toBeLessThanOrEqual(992);
        // Cerca: el hueco entre la tarjeta y el rótulo no pasa de su aire (salvo que el borde de la pantalla la empuje).
        const huecoX = Math.max(rotulo.left - (p.left + 340), p.left - rotulo.right, 0);
        const huecoY = Math.max(rotulo.top - (p.top + 170), p.top - rotulo.bottom, 0);
        expect(Math.max(huecoX, huecoY), `rótulo en ${left},${top}`).toBeLessThanOrEqual(AIRE);
      }
    }
  });

  it("⛔ en una ventana baja (laptop) tampoco tapa el rótulo: si no cabe ni encima ni debajo, va al costado de adentro", () => {
    for (const [vw, vh, h] of [[1280, 560, 320], [1366, 620, 320], [1366, 650, 380], [1440, 700, 380], [1536, 730, 380]]) {
      for (const left of [110, 300, vw - 300]) {
        for (let top = 0; top + 60 <= vh; top += 20) {
          const rotulo = rotuloEn(left, top);
          const p = posicionDeLaTarjeta({ vw, vh, w: 340, h, x: left, y: top, radar: { left: 40, right: vw - 40, top: 0, bottom: vh }, rotulo });
          expect(seCruzan(p, 340, h, rotulo), `${vw}×${vh}, rótulo en ${left},${top}`).toBe(false);
        }
      }
    }
  });

  it("sin rótulo, junto al puntero", () => {
    const p = posicionDeLaTarjeta({ ...ancha, x: 900, y: 500, rotulo: null });
    expect(p.left).toBe(900 + AIRE);
  });

  it("⛔ en tablet y teléfono, en la otra mitad de la pantalla: nunca tapa el dedo", () => {
    for (const vw of [375, 768, ANCHO_PARA_IR_AL_COSTADO - 1]) {
      const vh = 812;
      const w = Math.min(340, vw - 24);
      for (const y of [100, 300, 405, 406, 512, 700]) {
        const p = posicionDeLaTarjeta({ vw, vh, w, h: 591, x: vw / 2, y, radar: { left: 12, right: vw - 12, top: 100, bottom: 600 }, rotulo: null });
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

describe("el puente del cursor a la tarjeta (8 nov)", () => {
  const tarjeta: Caja = { left: 600, right: 900, top: 100, bottom: 400 };

  it("sabe si el cursor va rumbo a la tarjeta", () => {
    expect(vaHaciaLaTarjeta({ x: 400, y: 250 }, { x: 450, y: 250 }, tarjeta)).toBe(true);
    expect(vaHaciaLaTarjeta({ x: 450, y: 250 }, { x: 400, y: 250 }, tarjeta)).toBe(false);
    // De lado, sin acercarse: no va rumbo a ella.
    expect(vaHaciaLaTarjeta({ x: 400, y: 250 }, { x: 400, y: 300 }, tarjeta)).toBe(false);
    expect(vaHaciaLaTarjeta(null, { x: 450, y: 250 }, tarjeta)).toBe(false);
    expect(vaHaciaLaTarjeta({ x: 400, y: 250 }, { x: 450, y: 250 }, null)).toBe(false);
    expect(distanciaALaCaja({ x: 700, y: 200 }, tarjeta)).toBe(0);
  });

  it("sin tarjeta abierta, la pieza abre la suya", () => {
    expect(alEntrarEnUnaPieza(null, { clave: "1.2", eje: "1.2", deEje: true }, false)).toBe("abrir");
  });

  it("⛔ el camino por su propio eje no cambia la tarjeta: con áreas superpuestas, del nodo de Marketing a su rótulo sigue la de Marketing", () => {
    const marketing = { clave: "2.4", eje: "1.4" };
    for (const rumbo of [true, false]) {
      expect(alEntrarEnUnaPieza(marketing, { clave: "1.4", eje: "1.4", deEje: true }, rumbo)).toBe("nada");
    }
    // El nodo de Ventas del mismo eje sí es otra dimensión.
    expect(alEntrarEnUnaPieza(marketing, { clave: "1.4", eje: "1.4", deEje: false }, false)).toBe("abrir");
  });

  it("⛔ otra dimensión rumbo a la tarjeta espera a que el cursor se quede; sin ir rumbo a ella, cambia de una", () => {
    const abierta = { clave: "1.1", eje: "1.1" };
    expect(alEntrarEnUnaPieza(abierta, { clave: "1.2", eje: "1.2", deEje: true }, true)).toBe("esperar");
    expect(alEntrarEnUnaPieza(abierta, { clave: "1.2", eje: "1.2", deEje: true }, false)).toBe("abrir");
    expect(alEntrarEnUnaPieza(abierta, { clave: "1.1", eje: "1.1", deEje: false }, true)).toBe("nada");
  });

  it("las esperas son cortas: la tarjeta no queda pegada al dejar el radar", () => {
    expect(GRACIA_PARA_LLEGAR_MS).toBeLessThanOrEqual(400);
    expect(GRACIA_AL_SALIR_MS).toBeLessThanOrEqual(250);
    expect(ESPERA_AL_CRUZAR_MS).toBeLessThanOrEqual(200);
  });
});
