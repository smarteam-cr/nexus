import { describe, expect, it } from "vitest";
import { mapearSaldo } from "./saldos";

describe("mapearSaldo", () => {
  it("usa el DISPONIBLE, guarda el contable aparte y la razón social como sociedad", () => {
    expect(
      mapearSaldo({
        id: "a1",
        name: "Mercury Checking ••6736",
        status: "active",
        currentBalance: 13606.36,
        availableBalance: 3227.69,
        legalBusinessName: "Smarteam LLC",
      }),
    ).toEqual({ mercuryAccountId: "a1", nombre: "Mercury Checking ••6736", disponible: 3227.69, contable: 13606.36, sociedad: "Smarteam LLC" });
  });

  it("el apodo va entre paréntesis", () => {
    expect(mapearSaldo({ id: "a2", name: "Mercury Checking ••0982", nickname: "Licencias", availableBalance: 0.09 })?.nombre).toBe("Mercury Checking ••0982 (Licencias)");
  });

  it("sin id, sin saldo disponible o con la cuenta cerrada no se lee", () => {
    expect(mapearSaldo({ name: "x", availableBalance: 1 })).toBeNull();
    expect(mapearSaldo({ id: "a3", availableBalance: "1" })).toBeNull();
    expect(mapearSaldo({ id: "a4", status: "archived", availableBalance: 1 })).toBeNull();
  });
});
