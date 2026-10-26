import { describe, expect, it } from "vitest";
import { eventoDeLaElegida, reunionHechaDe, sesionDelEvento, type ReunionDeMeet, type ReunionPlaneada } from "./reunion-hecha";

const A_LAS_10 = new Date("2026-10-28T16:00:00Z");
const min = (n: number) => new Date(+A_LAS_10 + n * 60_000);

const planeada = (extra: Partial<ReunionPlaneada> = {}): ReunionPlaneada => ({ origenId: "agenda:kolbi:2026-10-28T16:00", clientId: "kolbi", reunionInicio: A_LAS_10, invitados: ["ana@kolbi.cr"], ...extra });
const meet = (id: string, extra: Partial<ReunionDeMeet> = {}): ReunionDeMeet => ({ id, inicio: A_LAS_10, participantes: ["ana@kolbi.cr", "lidia@smarteamcr.com"], duenoClienteId: "kolbi", puertasAdentro: false, ...extra });

describe("eventoDeLaElegida", () => {
  it("saca el evento de «elegida:<cuenta>:<evento>»; otra clave, nada", () => {
    expect(eventoDeLaElegida("elegida:kolbi:7dvpo_20261028T160000Z")).toBe("7dvpo_20261028T160000Z");
    expect(eventoDeLaElegida("agenda:kolbi:2026-10-28T16:00")).toBeNull();
    expect(eventoDeLaElegida("elegida:kolbi")).toBeNull();
    expect(eventoDeLaElegida(null)).toBeNull();
  });
});

describe("reunionHechaDe", () => {
  it("la elegida del calendario se une a la sesión de ESE evento, aunque haya otra a la misma hora", () => {
    const p = planeada({ origenId: "elegida:kolbi:ev1" });
    expect(reunionHechaDe(p, [meet("gmeet_otro"), meet(sesionDelEvento("ev1"), { inicio: min(90) })])).toBe("gmeet_ev1");
  });

  it("la elegida de una sesión que quedó de otra cuenta no se une (invariante 1)", () => {
    expect(reunionHechaDe(planeada({ origenId: "elegida:kolbi:ev1" }), [meet("gmeet_ev1", { duenoClienteId: "honda" })])).toBeNull();
  });

  it("sin evento: la única de la misma cuenta, cerca de la hora y con un invitado", () => {
    expect(reunionHechaDe(planeada(), [meet("a", { inicio: min(20) })])).toBe("a");
    expect(reunionHechaDe(planeada(), [meet("a", { inicio: min(60) })])).toBeNull();
    expect(reunionHechaDe(planeada(), [meet("a", { duenoClienteId: "honda" })])).toBeNull();
    expect(reunionHechaDe(planeada(), [meet("a", { participantes: ["otro@kolbi.cr"] })])).toBeNull();
    expect(reunionHechaDe(planeada(), [meet("a", { puertasAdentro: true })])).toBeNull();
  });

  it("ante la duda (dos que calzan), ninguna", () => {
    expect(reunionHechaDe(planeada(), [meet("a"), meet("b", { inicio: min(10) })])).toBeNull();
  });

  it("sin invitados en la tarea, basta la cuenta y la hora; sin cuenta, solo una de puertas adentro", () => {
    expect(reunionHechaDe(planeada({ invitados: [] }), [meet("a", { participantes: ["x@y.com"] })])).toBe("a");
    expect(reunionHechaDe(planeada({ clientId: null, invitados: [] }), [meet("a")])).toBeNull();
    expect(reunionHechaDe(planeada({ clientId: null, invitados: [] }), [meet("b", { puertasAdentro: true, duenoClienteId: null })])).toBe("b");
  });
});
