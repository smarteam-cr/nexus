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
  cicloDeTarjeta,
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

/**
 * El ciclo es la única parte de esta pantalla que produce FECHAS, y una fecha
 * inventada es la que hace pagar tarde. Cada caso protege una forma concreta de
 * inventarla: rellenar un día que nadie cargó, poner el 31 en febrero, o correr
 * el pago un mes para el lado equivocado.
 */
describe("cicloDeTarjeta", () => {
  it("sin los dos días NO inventa un ciclo: devuelve null", () => {
    // Asumir "el 30" pondría un vencimiento que nadie escribió. La pantalla dice
    // qué falta, igual que `faltaDato` en calcularTarjeta.
    expect(cicloDeTarjeta("2026-09-01", null, null)).toBeNull();
    expect(cicloDeTarjeta("2026-09-01", 15, null)).toBeNull();
    expect(cicloDeTarjeta("2026-09-01", null, 30)).toBeNull();
  });

  it("un día imposible (0, 32, decimal) cuenta como FALTANTE, no se clampea", () => {
    // Clampear un 32 diría "fin de mes" sin que nadie lo haya escrito.
    expect(cicloDeTarjeta("2026-09-01", 32, 15)).toBeNull();
    expect(cicloDeTarjeta("2026-09-01", 15, 0)).toBeNull();
    expect(cicloDeTarjeta("2026-09-01", 15.5, 20)).toBeNull();
  });

  it("con diaPago > diaCorte el pago cae en el MISMO mes del corte", () => {
    const c = cicloDeTarjeta("2026-09-01", 15, 30)!;
    expect(c.proximoCorte).toBe("2026-09-15");
    expect(c.fechaLimitePago).toBe("2026-09-30");
    expect(c.diasAlCorte).toBe(14);
    expect(c.diasAlPago).toBe(29);
    expect(c.estimado).toBe(true);
  });

  it("con diaPago < diaCorte el pago cae en el mes SIGUIENTE", () => {
    const c = cicloDeTarjeta("2026-09-01", 20, 5)!;
    expect(c.proximoCorte).toBe("2026-09-20");
    expect(c.fechaLimitePago).toBe("2026-10-05");
    expect(c.diasAlPago).toBe(34);
  });

  it("con diaPago == diaCorte también cae en el mes SIGUIENTE (nunca el mismo día)", () => {
    // Pagar el mismo día del corte sería un vencimiento imposible: el estado de
    // cuenta se emite ESE día.
    const c = cicloDeTarjeta("2026-09-01", 15, 15)!;
    expect(c.proximoCorte).toBe("2026-09-15");
    expect(c.fechaLimitePago).toBe("2026-10-15");
  });

  it("un corte el 31 en febrero cae el 28 (clamp al largo real del mes)", () => {
    const c = cicloDeTarjeta("2026-02-01", 31, 15)!;
    expect(c.proximoCorte).toBe("2026-02-28");
    expect(c.diasAlCorte).toBe(27);
    // 15 <= 31 ⇒ mes siguiente. La comparación usa los días CONFIGURADOS.
    expect(c.fechaLimitePago).toBe("2026-03-15");
  });

  it("el mismo corte del 31 en un año BISIESTO cae el 29", () => {
    const c = cicloDeTarjeta("2024-02-01", 31, 15)!;
    expect(c.proximoCorte).toBe("2024-02-29");
    expect(c.diasAlCorte).toBe(28);
  });

  it("el día de PAGO también se clampea al mes en que aterriza", () => {
    // Corte 5, pago 31: el de enero ya pasó ⇒ corte 5-feb y pago 28-feb.
    const c = cicloDeTarjeta("2026-01-20", 5, 31)!;
    expect(c.proximoCorte).toBe("2026-02-05");
    expect(c.fechaLimitePago).toBe("2026-02-28");
  });

  it("cruza de diciembre a enero sin saltarse el año", () => {
    const c = cicloDeTarjeta("2026-12-20", 15, 5)!;
    expect(c.proximoCorte).toBe("2027-01-15");
    expect(c.fechaLimitePago).toBe("2027-02-05");
    expect(c.diasAlCorte).toBe(26);
    expect(c.diasAlPago).toBe(47);
  });

  it("si HOY es el día del corte, el próximo corte es hoy (0 días), no el mes que viene", () => {
    const c = cicloDeTarjeta("2026-09-15", 15, 30)!;
    expect(c.proximoCorte).toBe("2026-09-15");
    expect(c.diasAlCorte).toBe(0);
    expect(c.diasAlPago).toBe(15);
  });

  it("un día después del corte ya apunta al ciclo siguiente", () => {
    const c = cicloDeTarjeta("2026-09-16", 15, 30)!;
    expect(c.proximoCorte).toBe("2026-10-15");
    expect(c.fechaLimitePago).toBe("2026-10-30");
  });
});
