import { describe, expect, it } from "vitest";
import { diaDeEntradaDeLaAgenda, diaDeTrabajo, diaQueSeVe, diasDeLaGrilla, pasoDeLaAgenda, vistaPedidaDeLaAgenda } from "./agenda-dias";

// 2026-10-16 es viernes; 17 sábado; 18 domingo; 19 lunes.
describe("la vista con que abre la agenda", () => {
  it("abre en la semana; el día solo si se pide", () => {
    expect(vistaPedidaDeLaAgenda(undefined)).toBe("semana");
    expect(vistaPedidaDeLaAgenda(null)).toBe("semana");
    expect(vistaPedidaDeLaAgenda("semana")).toBe("semana");
    expect(vistaPedidaDeLaAgenda("otra")).toBe("semana");
    expect(vistaPedidaDeLaAgenda("dia")).toBe("dia");
  });
});

describe("la agenda en fin de semana", () => {
  it("de lunes a viernes, la agenda abre en hoy y en su semana", () => {
    expect(diaDeEntradaDeLaAgenda("2026-10-15", "dia")).toBe("2026-10-15");
    expect(diaDeEntradaDeLaAgenda("2026-10-15", "semana")).toBe("2026-10-12");
    expect(diaDeEntradaDeLaAgenda("2026-10-16", "semana")).toBe("2026-10-12");
  });

  it("un sábado o un domingo abre en el lunes que viene y en su semana", () => {
    expect(diaDeEntradaDeLaAgenda("2026-10-17", "dia")).toBe("2026-10-19");
    expect(diaDeEntradaDeLaAgenda("2026-10-18", "dia")).toBe("2026-10-19");
    expect(diaDeEntradaDeLaAgenda("2026-10-17", "semana")).toBe("2026-10-19");
    expect(diaDeEntradaDeLaAgenda("2026-10-18", "semana")).toBe("2026-10-19");
  });

  it("cruza el mes y el año", () => {
    expect(diaDeTrabajo("2026-10-31")).toBe("2026-11-02");
    expect(diaDeEntradaDeLaAgenda("2027-01-02", "semana")).toBe("2027-01-04");
  });

  it("un día pedido en fin de semana se ve como el lunes; en la semana, su lunes", () => {
    expect(diaQueSeVe("dia", "2026-10-18")).toBe("2026-10-19");
    expect(diaQueSeVe("semana", "2026-10-14")).toBe("2026-10-12");
    expect(diaQueSeVe("semana", "2026-10-17")).toBe("2026-10-19");
  });

  it("‹ y › saltan el fin de semana en «Día» y van de a una semana en «Semana»", () => {
    expect(pasoDeLaAgenda("dia", "2026-10-16", 1)).toBe("2026-10-19");
    expect(pasoDeLaAgenda("dia", "2026-10-19", -1)).toBe("2026-10-16");
    expect(pasoDeLaAgenda("dia", "2026-10-14", 1)).toBe("2026-10-15");
    expect(pasoDeLaAgenda("semana", "2026-10-12", 1)).toBe("2026-10-19");
    expect(pasoDeLaAgenda("semana", "2026-10-12", -1)).toBe("2026-10-05");
  });

  it("la semana muestra de lunes a viernes", () => {
    expect(diasDeLaGrilla("semana", "2026-10-19")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(diasDeLaGrilla("dia", "2026-10-19")).toEqual(["2026-10-19"]);
  });
});
