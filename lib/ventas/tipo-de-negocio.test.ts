import { describe, expect, it } from "vitest";
import { compartidaAlFirmar, tipoDeNegocioDe } from "./tipo-de-negocio";

describe("el tipo de negocio de HubSpot", () => {
  it("Nuevo negocio y Recuperación son nuevos; Expansión y Renovación, lo suyo; lo demás, sin marcar", () => {
    expect(tipoDeNegocioDe("nuevo_negocio")).toBe("NUEVO");
    expect(tipoDeNegocioDe("recuperacion")).toBe("NUEVO");
    expect(tipoDeNegocioDe("expansion")).toBe("EXPANSION");
    expect(tipoDeNegocioDe("renovacion")).toBe("RENOVACION");
    expect(tipoDeNegocioDe("")).toBeNull();
    expect(tipoDeNegocioDe(null)).toBeNull();
    expect(tipoDeNegocioDe("otra_cosa")).toBeNull();
  });
});

describe("con quién se compartió, al firmar", () => {
  const ganadaEn = new Date("2026-10-10T15:00:00.000Z");

  it("vale el valor que tenía al entrar a ganado", () => {
    const h = [{ value: "111", timestamp: "2026-10-01T10:00:00.000Z" }];
    expect(compartidaAlFirmar("111", h, ganadaEn)).toEqual({ ownerId: "111", despuesDeLaFirma: false });
  });

  it("marcada después de la firma: no vale, y se dice", () => {
    const h = [{ value: "111", timestamp: "2026-10-12T10:00:00.000Z" }];
    expect(compartidaAlFirmar("111", h, ganadaEn)).toEqual({ ownerId: null, despuesDeLaFirma: true });
  });

  it("cambiada después de la firma: vale la de antes", () => {
    const h = [
      { value: "222", timestamp: "2026-10-20T10:00:00.000Z" },
      { value: "111", timestamp: "2026-10-01T10:00:00.000Z" },
    ];
    expect(compartidaAlFirmar("222", h, ganadaEn)).toEqual({ ownerId: "111", despuesDeLaFirma: true });
  });

  it("sin la fecha de ganado, vale la de hoy; sin marca, nadie", () => {
    expect(compartidaAlFirmar("111", [], null)).toEqual({ ownerId: "111", despuesDeLaFirma: false });
    expect(compartidaAlFirmar(null, [], ganadaEn)).toEqual({ ownerId: null, despuesDeLaFirma: false });
  });
});
