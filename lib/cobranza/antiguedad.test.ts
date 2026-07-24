import { describe, it, expect } from "vitest";
import {
  bucketAntiguedad,
  clasificarCobro,
  resumenAntiguedad,
  estadoTanda,
  esDiaDeCorte,
  superaCreditoEstandar,
  type CobroClasificable,
} from "./antiguedad";

const HOY = "2026-07-24";

/** Cobro base: facturado el día que tocaba (así lo dejó el import del histórico). */
function cobro(p: Partial<CobroClasificable> & { fechaProgramada: string }): CobroClasificable {
  return {
    estado: "POR_COBRAR",
    fechaEmision: p.fechaProgramada,
    monto: 100,
    moneda: "USD",
    creditoDias: 15,
    ...p,
  };
}

describe("bucketAntiguedad — bordes exactos", () => {
  it("cierra cada cubo por arriba", () => {
    expect(bucketAntiguedad(0)).toBe("d0_30");
    expect(bucketAntiguedad(30)).toBe("d0_30");
    expect(bucketAntiguedad(31)).toBe("d31_60");
    expect(bucketAntiguedad(60)).toBe("d31_60");
    expect(bucketAntiguedad(61)).toBe("d61_90");
    expect(bucketAntiguedad(90)).toBe("d61_90");
    expect(bucketAntiguedad(91)).toBe("d90mas");
    expect(bucketAntiguedad(189)).toBe("d90mas"); // KAIZEN
  });

  it("solo el primer cubo queda dentro del crédito estándar de 30 días", () => {
    expect(superaCreditoEstandar("d0_30")).toBe(false);
    expect(superaCreditoEstandar("d31_60")).toBe(true);
    expect(superaCreditoEstandar("d90mas")).toBe(true);
  });
});

describe("clasificarCobro", () => {
  it("EL BUG: atrasado y sin facturar NO cae en 'Esta quincena'", () => {
    // Caso real (Honda, 15-may) que aparecía dentro de la quincena del 16-31 jul.
    const c = cobro({ fechaProgramada: "2026-05-15", fechaEmision: null, estado: "PROGRAMADO" });
    expect(clasificarCobro(c, HOY)).toBe("sinFacturar");
  });

  it("sin facturar va a su grupo aunque sea viejísimo (no se mezcla con lo vencido)", () => {
    const c = cobro({ fechaProgramada: "2026-01-15", fechaEmision: null, estado: "PROGRAMADO" });
    expect(clasificarCobro(c, HOY)).toBe("sinFacturar");
  });

  it("vencido de verdad cae en su cubo por antigüedad", () => {
    expect(clasificarCobro(cobro({ fechaProgramada: "2026-01-15" }), HOY)).toBe("d90mas"); // 190 d
    expect(clasificarCobro(cobro({ fechaProgramada: "2026-05-15" }), HOY)).toBe("d61_90"); // 70 d
    expect(clasificarCobro(cobro({ fechaProgramada: "2026-06-15" }), HOY)).toBe("d31_60"); // 39 d
    expect(clasificarCobro(cobro({ fechaProgramada: "2026-07-01" }), HOY)).toBe("d0_30"); // 23 d
  });

  it("lo de esta quincena se queda en esta quincena", () => {
    expect(clasificarCobro(cobro({ fechaProgramada: "2026-07-24" }), HOY)).toBe("quincena");
    expect(clasificarCobro(cobro({ fechaProgramada: "2026-07-30" }), HOY)).toBe("quincena");
  });

  it("lo de la quincena siguiente va a 'más adelante'", () => {
    expect(clasificarCobro(cobro({ fechaProgramada: "2026-08-01" }), HOY)).toBe("adelante");
    expect(clasificarCobro(cobro({ fechaProgramada: "2026-12-30" }), HOY)).toBe("adelante");
  });

  it("recién facturado y todavía en plazo NO es vencido, aunque la fecha ya pasó", () => {
    // Programado el 20, facturado el 20, 15 días de crédito → vence el 4-ago.
    const c = cobro({ fechaProgramada: "2026-07-20", fechaEmision: "2026-07-20" });
    expect(clasificarCobro(c, HOY)).toBe("quincena");
  });

  it("una promesa de pago vigente lo saca de los cubos de vencido", () => {
    const c = cobro({ fechaProgramada: "2026-01-15", promesaPago: "2026-08-10" });
    expect(clasificarCobro(c, HOY)).toBe("quincena");
  });

  it("un futuro jamás cae en un cubo de vencido", () => {
    for (const f of ["2026-07-25", "2026-08-15", "2026-11-30"]) {
      expect(clasificarCobro(cobro({ fechaProgramada: f }), HOY)).not.toMatch(/^d/);
    }
  });
});

describe("resumenAntiguedad", () => {
  const rows: CobroClasificable[] = [
    cobro({ fechaProgramada: "2026-01-15", monto: 21501 }), // 190 d → d90mas
    cobro({ fechaProgramada: "2026-05-15", monto: 550 }), // 70 d → d61_90
    cobro({ fechaProgramada: "2026-06-15", monto: 1000 }), // 39 d → d31_60
    cobro({ fechaProgramada: "2026-07-01", monto: 2000 }), // 23 d → d0_30
    cobro({ fechaProgramada: "2026-05-15", monto: 500, fechaEmision: null, estado: "PROGRAMADO" }),
    cobro({ fechaProgramada: "2026-08-15", monto: 9999 }), // futuro
  ];

  it("reparte la plata por cubo y no cuenta dos veces", () => {
    const r = resumenAntiguedad(rows, HOY).USD;
    expect(r.aging).toEqual({ d90mas: 21501, d61_90: 550, d31_60: 1000, d0_30: 2000 });
    expect(r.totalVencido).toBe(21501 + 550 + 1000 + 2000);
    expect(r.nVencidos).toBe(4);
  });

  it("el KPI de +30 días excluye el cubo de 0-30", () => {
    const r = resumenAntiguedad(rows, HOY).USD;
    expect(r.vencido30mas).toBe(21501 + 550 + 1000);
    expect(r.n30mas).toBe(3);
  });

  it("lo sin facturar va aparte y NO entra en el vencido", () => {
    const r = resumenAntiguedad(rows, HOY).USD;
    expect(r.sinFacturar).toBe(500);
    expect(r.nSinFacturar).toBe(1);
    expect(r.totalVencido).not.toContain(500);
  });

  it("el DSO pondera por monto y deja fuera los futuros", () => {
    // Dos cobros exigibles: 100 a 10 días y 300 a 30 días → (10*100+30*300)/400 = 25
    const r = resumenAntiguedad(
      [
        cobro({ fechaProgramada: "2026-07-14", monto: 100 }),
        cobro({ fechaProgramada: "2026-06-24", monto: 300 }),
        cobro({ fechaProgramada: "2026-09-01", monto: 9999 }), // futuro: no diluye
      ],
      HOY,
    ).USD;
    expect(r.dso).toBe(25);
  });

  it("sin exigibles el DSO es null, no cero (cero mentiría)", () => {
    const r = resumenAntiguedad([cobro({ fechaProgramada: "2026-09-01" })], HOY).USD;
    expect(r.dso).toBeNull();
  });

  it("NUNCA suma monedas distintas", () => {
    const r = resumenAntiguedad(
      [
        cobro({ fechaProgramada: "2026-01-15", monto: 100, moneda: "USD" }),
        cobro({ fechaProgramada: "2026-01-15", monto: 5000, moneda: "CRC" }),
      ],
      HOY,
    );
    expect(r.USD.totalVencido).toBe(100);
    expect(r.CRC.totalVencido).toBe(5000);
  });

  it("ignora los cobrados", () => {
    const r = resumenAntiguedad(
      [cobro({ fechaProgramada: "2026-01-15", estado: "COBRADO", monto: 999 })],
      HOY,
    );
    expect(r.USD).toBeUndefined();
  });
});

describe("tandas de cobro (1-5 y 15-20)", () => {
  it("reconoce la ventana activa", () => {
    expect(estadoTanda("2026-07-01").activa?.id).toBe(1);
    expect(estadoTanda("2026-07-05").activa?.id).toBe(1);
    expect(estadoTanda("2026-07-15").activa?.id).toBe(2);
    expect(estadoTanda("2026-07-20").activa?.id).toBe(2);
  });

  it("entre ventanas dice cuánto falta para la próxima", () => {
    const e = estadoTanda("2026-07-10");
    expect(e.activa).toBeNull();
    expect(e.proximaDesde).toBe(15);
    expect(e.diasParaProxima).toBe(5);
  });

  it("pasada la segunda tanda, la próxima es el 1 del mes que viene", () => {
    const e = estadoTanda("2026-07-24"); // julio tiene 31
    expect(e.activa).toBeNull();
    expect(e.proximaDesde).toBe(1);
    expect(e.diasParaProxima).toBe(8); // 31 − 24 + 1
  });

  it("cierra bien un mes corto (febrero)", () => {
    expect(estadoTanda("2026-02-28").diasParaProxima).toBe(1);
  });

  it("el corte cae al arranque de cada tanda", () => {
    expect(esDiaDeCorte("2026-07-01")).toBe(true);
    expect(esDiaDeCorte("2026-07-15")).toBe(true);
    for (const d of ["2026-07-02", "2026-07-14", "2026-07-20", "2026-07-31"]) {
      expect(esDiaDeCorte(d)).toBe(false);
    }
  });
});
