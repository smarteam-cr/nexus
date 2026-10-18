import { describe, expect, it } from "vitest";
import { debeVolverATriar, huellaDeLaCorrida, huellaDelBarrido, type MotivosDelBarrido } from "./vigia-barrido";

const MOTIVOS: MotivosDelBarrido = {
  cronograma: true,
  fasesVencidas: 1,
  tareasVencidas: 3,
  estancado: false,
  alarmasDeEtapa: ["kickoff", "handoff"],
  alcanceExcedido: false,
  frio: true,
  ticketsAbiertos: 0,
  renovacionCerca: false,
  relacionPorVencer: false,
  deuda: false,
  bloqueadoEnHubspot: false,
  estadoEnHubspot: "active",
  cancelacion: false,
  senalDeIngresos: false,
  usoBajoConRenovacion: false,
  licenciasSinUsarConRenovacion: false,
};

const AHORA = new Date("2026-10-18T13:00:00Z");
const DIA = 86_400_000;

describe("la huella de los motivos", () => {
  it("el orden de las alarmas no la cambia; una tarea vencida más sí", () => {
    const h = huellaDelBarrido(MOTIVOS);
    expect(huellaDelBarrido({ ...MOTIVOS, alarmasDeEtapa: ["handoff", "kickoff"] })).toBe(h);
    expect(huellaDelBarrido({ ...MOTIVOS, tareasVencidas: 4 })).not.toBe(h);
    expect(huellaDelBarrido({ ...MOTIVOS, deuda: true })).not.toBe(h);
    expect(h).toHaveLength(16);
  });
});

describe("⭐ no se vuelve a triar lo que no cambió", () => {
  const h = huellaDelBarrido(MOTIVOS);

  it("la misma huella hace 2 días: no se repite", () => {
    expect(debeVolverATriar({ huella: h, anterior: { huella: h, at: new Date(+AHORA - 2 * DIA) }, ahora: AHORA, dias: 7 })).toBe(false);
  });

  it("pasado el plazo se vuelve a triar aunque nada cambie", () => {
    expect(debeVolverATriar({ huella: h, anterior: { huella: h, at: new Date(+AHORA - 7 * DIA) }, ahora: AHORA, dias: 7 })).toBe(true);
  });

  it("si cambió un motivo, o no hay corrida anterior, o la anterior no guardó huella: se tría", () => {
    expect(debeVolverATriar({ huella: h, anterior: { huella: "otra", at: new Date(+AHORA - DIA) }, ahora: AHORA, dias: 7 })).toBe(true);
    expect(debeVolverATriar({ huella: h, anterior: null, ahora: AHORA, dias: 7 })).toBe(true);
    expect(debeVolverATriar({ huella: h, anterior: { huella: null, at: new Date(+AHORA - DIA) }, ahora: AHORA, dias: 7 })).toBe(true);
  });

  it("la huella se lee del output de la corrida, y un output viejo no la tiene", () => {
    expect(huellaDeLaCorrida(JSON.stringify({ alerts: [], huellaDelBarrido: h }))).toBe(h);
    expect(huellaDeLaCorrida(JSON.stringify({ alerts: [] }))).toBeNull();
    expect(huellaDeLaCorrida("claim perdido")).toBeNull();
    expect(huellaDeLaCorrida(null)).toBeNull();
  });
});
