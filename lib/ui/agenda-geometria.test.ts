import { describe, expect, it } from "vitest";
import { caeEnElPasado, enMinutos, estirarBloque, moverBloque, mismaPosicion, type GeometriaDeLaAgenda } from "./agenda-geometria";

// 5 días de 100 px; 10 horas (600 min) en 480 px: 1 px = 1,25 min.
const G: GeometriaDeLaAgenda = { ancho: 500, alto: 480, dias: 5, minutosTotales: 600, paso: 15 };
const BLOQUE = { dia: 1, desde: 120, minutos: 60 };

describe("mover", () => {
  it("se corre en saltos de 15 minutos y en días enteros", () => {
    expect(moverBloque(BLOQUE, 0, 24, G)).toEqual({ dia: 1, desde: 150, minutos: 60 }); // 24 px = 30 min
    expect(moverBloque(BLOQUE, 0, 5, G)).toEqual({ dia: 1, desde: 120, minutos: 60 }); // 6,25 min → se queda
    expect(moverBloque(BLOQUE, 0, 8, G)).toEqual({ dia: 1, desde: 135, minutos: 60 }); // 10 min → 15
    expect(moverBloque(BLOQUE, 160, 0, G)).toEqual({ dia: 3, desde: 120, minutos: 60 }); // 1,6 días → 2
  });

  it("no se sale de la grilla: ni antes del lunes ni después del viernes, ni arriba ni abajo", () => {
    expect(moverBloque(BLOQUE, -900, -900, G)).toEqual({ dia: 0, desde: 0, minutos: 60 });
    expect(moverBloque(BLOQUE, 900, 900, G)).toEqual({ dia: 4, desde: 540, minutos: 60 });
  });

  it("sin medida (un nodo de 0×0) no se mueve nada: nunca un default", () => {
    expect(moverBloque(BLOQUE, 50, 50, { ...G, ancho: 0 })).toBeNull();
    expect(moverBloque(BLOQUE, 50, 50, { ...G, alto: 0 })).toBeNull();
  });

  it("no se suelta en lo que ya pasó", () => {
    const pasado = { dia: 1, desde: 180 };
    expect(moverBloque(BLOQUE, 0, 0, G, pasado)).toBeNull(); // el martes a las 2 h ya pasó
    expect(moverBloque(BLOQUE, 0, 48, G, pasado)).toEqual({ dia: 1, desde: 180, minutos: 60 });
    expect(moverBloque(BLOQUE, 100, 0, G, pasado)).toEqual({ dia: 2, desde: 120, minutos: 60 });
    expect(caeEnElPasado({ dia: 0, desde: 590 }, pasado)).toBe(true);
  });
});

describe("estirar", () => {
  it("cambia la duración en saltos de 15, entre un salto y el final de la grilla", () => {
    expect(estirarBloque(BLOQUE, 48, G)).toEqual({ dia: 1, desde: 120, minutos: 120 });
    expect(estirarBloque(BLOQUE, -900, G)).toEqual({ dia: 1, desde: 120, minutos: 15 });
    expect(estirarBloque(BLOQUE, 900, G)).toEqual({ dia: 1, desde: 120, minutos: 480 });
    expect(estirarBloque(BLOQUE, 10, { ...G, alto: 0 })).toBeNull();
  });
});

describe("de fracciones a minutos", () => {
  it("redondea al salto y nunca da un bloque de cero", () => {
    expect(enMinutos({ dia: 2, arriba: 0.2, alto: 0.1 }, 600, 15)).toEqual({ dia: 2, desde: 120, minutos: 60 });
    expect(enMinutos({ dia: 0, arriba: 0, alto: 0.001 }, 600, 15).minutos).toBe(15);
    expect(mismaPosicion(BLOQUE, { ...BLOQUE })).toBe(true);
  });
});
