/**
 * lib/cobranza/comision-hubspot.test.ts — la comisión de HubSpot desde Partner (U25).
 *
 * Correr: `npx vitest run lib/cobranza/comision-hubspot.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import {
  comprobarContraElUltimoPago,
  copiaFresca,
  decidirFilaDeHubspot,
  detalleDelEstimado,
  estimarComisionDeHubspot,
  mesesQueCuentan,
  pagoDeLaFecha,
  proximoPagoDeHubspot,
  type CuentaConComision,
  type FilaDeHubspot,
} from "./comision-hubspot";

const cuenta = (c: Partial<CuentaConComision> & { id: string }): CuentaConComision => ({
  nombre: c.id,
  clientId: null,
  comisionMensual: 100,
  moneda: "USD",
  gestionada: true,
  ventaDesde: null,
  ...c,
});

describe("el calendario de pagos de HubSpot", () => {
  it("el 15 de noviembre paga julio, agosto y septiembre", () => {
    expect(proximoPagoDeHubspot("2026-10-24")).toEqual({
      fecha: "2026-11-15",
      meses: ["2026-07", "2026-08", "2026-09"],
      trimestre: "jul–sep 2026",
    });
  });

  it("el día de pago cuenta como el próximo; el día siguiente ya es el de febrero del año que viene", () => {
    expect(proximoPagoDeHubspot("2026-11-15").fecha).toBe("2026-11-15");
    expect(proximoPagoDeHubspot("2026-11-16")).toEqual({
      fecha: "2027-02-15",
      meses: ["2026-10", "2026-11", "2026-12"],
      trimestre: "oct–dic 2026",
    });
  });

  it("pagoDeLaFecha solo reconoce el 15 de un mes de pago", () => {
    expect(pagoDeLaFecha("2026-08-15")?.meses).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(pagoDeLaFecha("2026-08-13")).toBeNull();
    expect(pagoDeLaFecha("2026-07-15")).toBeNull();
  });
});

describe("cuántos meses del trimestre cuenta cada venta", () => {
  const meses = ["2026-07", "2026-08", "2026-09"];
  it("una venta de antes cuenta los tres; una sin fecha también", () => {
    expect(mesesQueCuentan("2025-09-30", meses)).toBe(3);
    expect(mesesQueCuentan(null, meses)).toBe(3);
  });
  it("una venta cuenta el mes en que empezó, aunque sea el último día", () => {
    expect(mesesQueCuentan("2026-07-31", meses)).toBe(3);
    expect(mesesQueCuentan("2026-08-17", meses)).toBe(2);
    expect(mesesQueCuentan("2026-09-30", meses)).toBe(1);
  });
  it("una venta que empezó después del trimestre no cuenta", () => {
    expect(mesesQueCuentan("2026-10-01", meses)).toBe(0);
  });
});

describe("el estimado del trimestre", () => {
  const pago = proximoPagoDeHubspot("2026-10-24");

  it("suma la comisión mensual por los meses en que existía cada venta, y ordena de mayor a menor", () => {
    const e = estimarComisionDeHubspot(
      [
        cuenta({ id: "kolbi", comisionMensual: 4701.599998, ventaDesde: "2025-09-30" }),
        cuenta({ id: "vino", comisionMensual: 537.572, ventaDesde: "2026-09-30" }),
        cuenta({ id: "akriba", comisionMensual: 336, ventaDesde: "2026-08-31" }),
      ],
      pago,
    );
    expect(e.mensual).toBe(5575.17);
    expect(e.cuentas.map((c) => [c.id, c.meses, c.aporte])).toEqual([
      ["kolbi", 3, 14104.8],
      ["akriba", 2, 672],
      ["vino", 1, 537.57],
    ]);
    expect(e.total).toBe(15314.37);
  });

  it("sin comisión, en cero o negativa no aporta; sin moneda se lee USD", () => {
    const e = estimarComisionDeHubspot(
      [
        cuenta({ id: "a", comisionMensual: null }),
        cuenta({ id: "b", comisionMensual: 0 }),
        cuenta({ id: "c", comisionMensual: -5 }),
        cuenta({ id: "d", comisionMensual: 10, moneda: null }),
      ],
      pago,
    );
    expect(e.cuentas.map((c) => c.id)).toEqual(["d"]);
    expect(e.total).toBe(30);
  });

  it("USD y otra moneda nunca se suman: la otra queda aparte y fuera del total", () => {
    const e = estimarComisionDeHubspot([cuenta({ id: "a", comisionMensual: 10 }), cuenta({ id: "b", comisionMensual: 7, moneda: "eur" })], pago);
    expect(e.total).toBe(30);
    expect(e.otrasMonedas).toEqual([{ moneda: "EUR", mensual: 7, cuentas: 1 }]);
  });

  it("el detalle guarda lo justo por cuenta y cuándo se calculó", () => {
    const e = estimarComisionDeHubspot([cuenta({ id: "a", nombre: "Acme", clientId: "c1", comisionMensual: 10 })], pago);
    expect(detalleDelEstimado(e, new Date("2026-10-24T13:00:00Z"))).toEqual({
      calculadoEn: "2026-10-24T13:00:00.000Z",
      trimestre: "jul–sep 2026",
      meses: ["2026-07", "2026-08", "2026-09"],
      mensual: 10,
      cuentas: [{ id: "a", nombre: "Acme", clientId: "c1", meses: 3, mensual: 10, aporte: 30 }],
    });
  });
});

describe("qué hacer con la fila del pago", () => {
  const fila = (f: Partial<FilaDeHubspot>): FilaDeHubspot => ({
    id: "f1",
    estado: "POR_COBRAR",
    moneda: "USD",
    monto: 51000,
    montoEsProyeccion: true,
    montoDesdePartner: false,
    ...f,
  });
  const estimado = { total: 52551 };

  it("sin fila la crea; sin comisión proyectada no crea nada", () => {
    expect(decidirFilaDeHubspot([], estimado)).toEqual({ accion: "crear" });
    expect(decidirFilaDeHubspot([], { total: 0 }).accion).toBe("nada");
  });

  it("una cobrada o con el monto real de la factura no se toca, ni con tomarLaManual", () => {
    expect(decidirFilaDeHubspot([fila({ estado: "COBRADO", montoEsProyeccion: false })], estimado, { tomarLaManual: true })).toMatchObject({ accion: "nada", motivo: "ya está cobrada" });
    expect(decidirFilaDeHubspot([fila({ montoEsProyeccion: false })], estimado, { tomarLaManual: true }).accion).toBe("nada");
  });

  it("la que armó Partner se pone al día", () => {
    expect(decidirFilaDeHubspot([fila({ montoDesdePartner: true })], estimado)).toEqual({ accion: "actualizar", tomaLaManual: false });
  });

  it("la escrita a mano: el job no la toca; el script con --apply la toma", () => {
    const d = decidirFilaDeHubspot([fila({})], estimado);
    expect(d.accion).toBe("nada");
    expect(d.accion === "nada" && d.motivo).toContain("scripts/comisiones-hubspot-estimado.ts --apply");
    expect(decidirFilaDeHubspot([fila({})], estimado, { tomarLaManual: true })).toEqual({ accion: "actualizar", tomaLaManual: true });
  });

  it("Partner en cero no baja a cero la que armó, ni con el script", () => {
    expect(decidirFilaDeHubspot([fila({ montoDesdePartner: true, monto: 52551 })], { total: 0 }).accion).toBe("nada");
    expect(decidirFilaDeHubspot([fila({ montoDesdePartner: true, monto: 52551 })], { total: 0 }, { tomarLaManual: true }).accion).toBe("nada");
  });

  it("una caída de más de la mitad no la escribe el job; el script, después del simulacro, sí", () => {
    const armada = fila({ montoDesdePartner: true, monto: 52551 });
    expect(decidirFilaDeHubspot([armada], { total: 26000 })).toMatchObject({ accion: "nada" });
    expect(decidirFilaDeHubspot([armada], { total: 27000 })).toEqual({ accion: "actualizar", tomaLaManual: false });
    expect(decidirFilaDeHubspot([armada], { total: 26000 }, { tomarLaManual: true })).toEqual({ accion: "actualizar", tomaLaManual: false });
  });

  it("una anotada en otra moneda no se toca", () => {
    expect(decidirFilaDeHubspot([fila({ moneda: "CRC", montoDesdePartner: true })], estimado, { tomarLaManual: true }).accion).toBe("nada");
  });

  it("dos filas para el mismo pago: no toca ninguna", () => {
    expect(decidirFilaDeHubspot([fila({ id: "a", montoDesdePartner: true }), fila({ id: "b" })], estimado, { tomarLaManual: true }).accion).toBe("nada");
  });
});

describe("la comprobación contra el último pago", () => {
  it("toma el último pago cobrado en día de pago y lo estima con las cuentas de hoy", () => {
    const cuentas = [cuenta({ id: "a", comisionMensual: 100 }), cuenta({ id: "b", comisionMensual: 50, ventaDesde: "2026-06-10" })];
    const c = comprobarContraElUltimoPago(cuentas, [
      { fecha: "2026-05-15", monto: 400, estado: "COBRADO", moneda: "USD" },
      { fecha: "2026-08-15", monto: 400, estado: "COBRADO", moneda: "USD" },
      { fecha: "2026-11-15", monto: 999, estado: "POR_COBRAR", moneda: "USD" },
      { fecha: "2026-09-02", monto: 999, estado: "COBRADO", moneda: "USD" },
    ]);
    // ago paga abr–jun: a 3 × 100 + b 1 × 50 = 350 contra 400 → −12,5 %.
    expect(c).toEqual({ fecha: "2026-08-15", trimestre: "abr–jun 2026", cobrado: 400, estimadoConLasDeHoy: 350, diferenciaPct: -12.5 });
  });

  it("sin pagos cobrados no hay comprobación", () => {
    expect(comprobarContraElUltimoPago([cuenta({ id: "a" })], [])).toBeNull();
  });
});

describe("la frescura de la copia", () => {
  const ahora = new Date("2026-10-26T12:00:00Z");
  it("la del viernes sirve el lunes; una de hace una semana no; sin copia, no", () => {
    expect(copiaFresca(new Date("2026-10-23T12:00:00Z"), ahora)).toBe(true);
    expect(copiaFresca(new Date("2026-10-19T12:00:00Z"), ahora)).toBe(false);
    expect(copiaFresca(null, ahora)).toBe(false);
  });
});
