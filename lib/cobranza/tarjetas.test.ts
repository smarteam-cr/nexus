/**
 * lib/cobranza/tarjetas.test.ts
 *
 * Lo que estos casos protegen NO es la resta: es la HONESTIDAD del cálculo.
 * Cada uno corresponde a una forma concreta de mentir que el diseño prohíbe —
 * inventar un disponible sin datos, mezclar monedas, o afirmar que algo "no
 * cabe" sin base para decirlo.
 */
import { describe, expect, it } from "vitest";
import {
  calcularTarjeta,
  cargadoMensualDe,
  mensualizado,
  type CostoDeTarjeta,
} from "./tarjetas";

const costo = (p: Partial<CostoDeTarjeta> = {}): CostoDeTarjeta => ({
  monto: 100,
  moneda: "USD",
  frecuencia: "MENSUAL",
  activo: true,
  finalizadoEl: null,
  ...p,
});

describe("mensualizado", () => {
  it("un MENSUAL vale lo que dice", () => {
    expect(mensualizado(130.6, "MENSUAL")).toBe(130.6);
  });

  it("un ANUAL se reparte /12 y se redondea a centavos", () => {
    expect(mensualizado(371.88, "ANUAL")).toBe(30.99);
  });
});

describe("cargadoMensualDe", () => {
  it("suma los costos de la MISMA moneda, ya mensualizados", () => {
    const r = cargadoMensualDe(
      [costo({ monto: 100 }), costo({ monto: 120, frecuencia: "ANUAL" })],
      "USD",
    );
    expect(r).toEqual({ total: 110, enOtraMoneda: 0 });
  });

  it("un costo en OTRA moneda NO se suma: se cuenta aparte", () => {
    // Convertirlo exigiría un tipo de cambio que este sistema no tiene.
    const r = cargadoMensualDe([costo({ monto: 100 }), costo({ monto: 50_000, moneda: "CRC" })], "USD");
    expect(r).toEqual({ total: 100, enOtraMoneda: 1 });
  });

  it("lo PAUSADO y lo dado de BAJA no se le cargan a la tarjeta", () => {
    const r = cargadoMensualDe(
      [
        costo({ monto: 10 }),
        costo({ monto: 999, activo: false }),
        costo({ monto: 777, finalizadoEl: "2026-07-01" }),
      ],
      "USD",
    );
    // Misma regla que el burn del panel de costos (activo && finalizadoEl == null):
    // si divergieran, la tarjeta cobraría algo que el burn ya no cuenta.
    expect(r.total).toBe(10);
  });

  it("sin costos asignados el cargado es cero, no null", () => {
    expect(cargadoMensualDe([], "CRC")).toEqual({ total: 0, enOtraMoneda: 0 });
  });
});

describe("calcularTarjeta", () => {
  it("disponible = límite − saldo, y el uso en porcentaje", () => {
    const r = calcularTarjeta({ limite: 5000, saldoUsado: 1250, cargadoMensual: 130.6 });
    expect(r.disponible).toBe(3750);
    expect(r.usoPorcentaje).toBe(25);
    expect(r.faltaDato).toBeNull();
  });

  it("sin límite NO inventa un disponible — lo declara faltante", () => {
    const r = calcularTarjeta({ limite: null, saldoUsado: 1250, cargadoMensual: 100 });
    expect(r.disponible).toBeNull();
    expect(r.usoPorcentaje).toBeNull();
    expect(r.faltaDato).toBe("limite");
  });

  it("sin saldo tampoco: el cargado mensual JAMÁS hace de saldo", () => {
    // Ésta es la regla medular. Un saldo es acumulado y un cargo es mensual;
    // usar uno como proxy del otro sería inventar una conciliación.
    const r = calcularTarjeta({ limite: 5000, saldoUsado: null, cargadoMensual: 4000 });
    expect(r.disponible).toBeNull();
    expect(r.faltaDato).toBe("saldo");
  });

  it("sin ninguno de los dos lo dice con una sola palabra", () => {
    const r = calcularTarjeta({ limite: null, saldoUsado: null, cargadoMensual: 0 });
    expect(r.faltaDato).toBe("ambos");
  });

  it("avisa cuando el próximo mes de cargos NO cabe en el disponible", () => {
    const r = calcularTarjeta({ limite: 1000, saldoUsado: 950, cargadoMensual: 130.6 });
    expect(r.disponible).toBe(50);
    expect(r.noCabeElProximoMes).toBe(true);
  });

  it("si cabe justo, NO avisa (el borde es <, no <=)", () => {
    const r = calcularTarjeta({ limite: 1000, saldoUsado: 869.4, cargadoMensual: 130.6 });
    expect(r.disponible).toBe(130.6);
    expect(r.noCabeElProximoMes).toBe(false);
  });

  it("sin cargos asignados NUNCA avisa, aunque el disponible sea cero", () => {
    // No hay nada que no quepa: afirmar un problema acá sería ruido.
    const r = calcularTarjeta({ limite: 1000, saldoUsado: 1000, cargadoMensual: 0 });
    expect(r.disponible).toBe(0);
    expect(r.noCabeElProximoMes).toBe(false);
  });

  it("sin datos NO avisa, aunque haya cargos: no hay contra qué comparar", () => {
    const r = calcularTarjeta({ limite: null, saldoUsado: null, cargadoMensual: 5000 });
    expect(r.noCabeElProximoMes).toBe(false);
  });

  it("un saldo mayor al límite da disponible negativo y se muestra tal cual", () => {
    // Pasa de verdad (sobregiro). Clamparlo a cero escondería el problema.
    const r = calcularTarjeta({ limite: 1000, saldoUsado: 1200, cargadoMensual: 0 });
    expect(r.disponible).toBe(-200);
    expect(r.usoPorcentaje).toBe(120);
  });

  it("un límite en cero no produce porcentaje (ni Infinity ni NaN)", () => {
    const r = calcularTarjeta({ limite: 0, saldoUsado: 0, cargadoMensual: 0 });
    expect(r.disponible).toBe(0);
    expect(r.usoPorcentaje).toBeNull();
  });
});
