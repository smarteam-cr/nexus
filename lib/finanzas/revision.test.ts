/**
 * lib/finanzas/revision.test.ts — la revisión de quien supervisa (rediseño de Finanzas, 2026-10-03, etapa «Revisión»).
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { describe, it, expect } from "vitest";
import {
  avisosDeGasto,
  avisosDePago,
  diasEntre,
  enRevision,
  huellaDeGasto,
  huellaDePago,
  ordenDeRevision,
} from "./revision";

const pago = { estado: "COBRADO", monto: 2000, moneda: "USD", fechaCobro: "2026-09-29", referenciaExterna: "TRF-1", numeroFactura: "INV-12" };

describe("la huella de un pago", () => {
  it("cambia si cambia el monto, la fecha en que entró, la referencia o la factura", () => {
    const h = huellaDePago(pago);
    expect(huellaDePago({ ...pago, monto: 2000.5 })).not.toBe(h);
    expect(huellaDePago({ ...pago, fechaCobro: "2026-09-30" })).not.toBe(h);
    expect(huellaDePago({ ...pago, referenciaExterna: "TRF-2" })).not.toBe(h);
    expect(huellaDePago({ ...pago, numeroFactura: null })).not.toBe(h);
  });
  it("no cambia por espacios de más en la referencia", () => {
    expect(huellaDePago({ ...pago, referenciaExterna: " TRF-1 " })).toBe(huellaDePago(pago));
  });
  it("un pago y un gasto con los mismos números no comparten huella", () => {
    expect(huellaDePago(pago)).not.toBe(huellaDeGasto({ nombre: "x", monto: 2000, moneda: "USD", fecha: "2026-09-29" }));
  });
});

describe("enRevision", () => {
  const h = huellaDePago(pago);
  it("sin revisión, es nuevo", () => expect(enRevision(h, null)).toBe("NUEVO"));
  it("revisado y sin cambios, ya no aparece", () => expect(enRevision(h, { estado: "BIEN", huella: h })).toBeNull());
  it("revisado y con un número distinto, vuelve con el aviso", () =>
    expect(enRevision(huellaDePago({ ...pago, monto: 1 }), { estado: "BIEN", huella: h })).toBe("CAMBIO"));
  it("devuelto sigue devuelto aunque lo toquen, hasta que digan que lo corrigieron", () => {
    expect(enRevision(huellaDePago({ ...pago, monto: 1 }), { estado: "DEVUELTO", huella: h })).toBe("DEVUELTO");
    expect(enRevision(h, { estado: "CORREGIDO", huella: h })).toBe("CORREGIDO");
  });
});

describe("los avisos", () => {
  it("cuentan días de calendario", () => {
    expect(diasEntre("2026-07-03", "2026-09-30")).toBe(89);
    expect(diasEntre("2026-09-30T23:10:00.000Z", "2026-10-01")).toBe(1);
  });
  it("un pago registrado 89 días después de entrar lo dice (el de Seléctrica)", () => {
    expect(avisosDePago({ fechaCobro: "2026-07-03", fechaEmision: "2026-06-30", registradoEn: "2026-09-30" })).toEqual([
      "Se registró 89 días después de entrar",
    ]);
  });
  it("un pago al día y con factura no lleva aviso", () => {
    expect(avisosDePago({ fechaCobro: "2026-09-29", fechaEmision: "2026-09-01", registradoEn: "2026-09-30" })).toEqual([]);
  });
  it("una fecha de entrada posterior al registro, o un cobro sin factura, se señalan", () => {
    expect(avisosDePago({ fechaCobro: "2026-10-05", fechaEmision: null, registradoEn: "2026-10-01" })).toEqual([
      "Dice que entró el 5 oct, después de registrarlo",
      "Cobrado sin factura marcada",
    ]);
  });
  it("un gasto anotado tarde o a futuro se señala", () => {
    expect(avisosDeGasto({ fecha: "2026-08-01", registradoEn: "2026-10-01" })).toEqual(["Se anotó 61 días después del gasto"]);
    expect(avisosDeGasto({ fecha: "2026-10-20", registradoEn: "2026-10-03" })).toEqual(["Es una compra a futuro, del 20 oct"]);
    expect(avisosDeGasto({ fecha: "2026-10-02", registradoEn: "2026-10-03" })).toEqual([]);
  });
});

describe("el orden", () => {
  it("primero lo corregido y lo que cambió, después lo más reciente", () => {
    const filas = [
      { id: "a", estado: "NUEVO" as const, registradoEn: "2026-09-01" },
      { id: "b", estado: "NUEVO" as const, registradoEn: "2026-09-20" },
      { id: "c", estado: "CAMBIO" as const, registradoEn: "2026-08-01" },
      { id: "d", estado: "CORREGIDO" as const, registradoEn: "2026-08-15" },
    ];
    expect(ordenDeRevision(filas).map((f) => f.id)).toEqual(["d", "c", "b", "a"]);
  });
});
