/**
 * lib/trivias/formato.test.ts — el código, los puntos y las fechas se escriben igual en el servidor y en el navegador.
 */
import { describe, expect, it } from "vitest";
import { fechaCortaCR, fechaYHoraCR, formatearCodigo, formatearPuntos } from "./formato";

describe("formato de Trivias", () => {
  it("el código en dos mitades", () => {
    expect(formatearCodigo("K7M2QX")).toBe("K7M 2QX");
    expect(formatearCodigo("ABC")).toBe("ABC");
  });

  it("los puntos con punto de miles, sin depender del largo", () => {
    expect(formatearPuntos(0)).toBe("0");
    expect(formatearPuntos(875)).toBe("875");
    expect(formatearPuntos(4500)).toBe("4.500");
    expect(formatearPuntos(12500)).toBe("12.500");
    expect(formatearPuntos(1234567)).toBe("1.234.567");
  });

  it("las fechas en hora de Costa Rica (UTC−6), con el año solo si no es el de hoy", () => {
    const hoy = Date.parse("2026-11-20T12:00:00Z");
    expect(fechaCortaCR("2026-11-19T22:05:00Z", hoy)).toBe("19 nov");
    expect(fechaYHoraCR("2026-11-19T22:05:00Z", hoy)).toBe("19 nov, 16:05");
    // 03:00 UTC del 20 son las 21:00 del 19 en Costa Rica.
    expect(fechaYHoraCR("2026-11-20T03:00:00Z", hoy)).toBe("19 nov, 21:00");
    expect(fechaCortaCR("2025-01-02T18:00:00Z", hoy)).toBe("2 ene 2025");
  });
});
