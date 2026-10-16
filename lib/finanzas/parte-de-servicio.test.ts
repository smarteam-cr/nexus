/**
 * lib/finanzas/parte-de-servicio.test.ts — la parte de servicio de los contratos con licencias revendidas (2026-10-16).
 */
import { describe, expect, it } from "vitest";
import { parteDeServicio } from "./parte-de-servicio";

const KOLBI = "cmv665y0n0000f4ijbo262y3q";

describe("parte de servicio", () => {
  it("kölbi: de cada factura mensual, US$2.225 de US$13.475 y ₡4.000.000 de ₡11.541.250 son servicio", () => {
    expect(Math.round(13_475 * parteDeServicio(KOLBI, "USD"))).toBe(2_225);
    expect(Math.round(11_541_250 * parteDeServicio(KOLBI, "CRC"))).toBe(4_000_000);
  });

  it("cualquier otra cuenta cuenta entera", () => {
    expect(parteDeServicio("otra", "USD")).toBe(1);
  });
});
