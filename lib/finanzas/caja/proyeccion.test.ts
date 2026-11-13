import { describe, expect, it } from "vitest";
import { cierreDelAnio, enDolares, proyectarCaja, type EntradaDeProyeccion } from "./proyeccion";
import { ordenarPagosSiNoAlcanza } from "./prioridad";
import { pagosPorSemana, type PagoDeLaSemana } from "./semana";

const corte = (key: string, desde: string, hasta: string, extra: Partial<EntradaDeProyeccion["cortes"][number]> = {}) => ({
  key,
  etiqueta: key,
  granularidad: "quincena" as const,
  desdeISO: desde,
  hastaISO: hasta,
  cobros: { CRC: 0, USD: 0 },
  costos: [],
  ...extra,
});

/** Lo que Marco hace de cabeza el 13 de noviembre, con números redondos. */
const entrada = (cambios: Partial<EntradaDeProyeccion> = {}): EntradaDeProyeccion => ({
  hoyISO: "2026-11-13",
  cierreISO: "2026-12-31",
  crcPorUsd: 500,
  saldos: [
    { cuentaId: "bcr", nombre: "BCR colones", moneda: "CRC", monto: 5_000_000, fechaISO: "2026-11-13" },
    { cuentaId: "usd", nombre: "Dólares", moneda: "USD", monto: 20_000, fechaISO: "2026-11-12" },
    { cuentaId: "m", nombre: "Mercury", moneda: "USD", monto: 30_000, fechaISO: "2026-11-13" },
  ],
  cortes: [
    corte("2026-11-Q1", "2026-11-01", "2026-11-15", { cobros: { CRC: 0, USD: 40_000 }, costos: [{ rubro: "PLANILLA", moneda: "USD", monto: 15_000 }] }),
    corte("2026-11-Q2", "2026-11-16", "2026-11-30", { cobros: { CRC: 1_000_000, USD: 30_000 }, costos: [{ rubro: "PLANILLA", moneda: "USD", monto: 15_000 }, { rubro: "HERRAMIENTAS", moneda: "USD", monto: 1_500 }] }),
    corte("2026-12-Q1", "2026-12-01", "2026-12-15", { cobros: { CRC: 0, USD: 30_000 }, costos: [{ rubro: "PLANILLA", moneda: "USD", monto: 15_000 }] }),
    corte("2026-12-Q2", "2026-12-16", "2026-12-31", { cobros: { CRC: 0, USD: 30_000 }, costos: [{ rubro: "PLANILLA", moneda: "USD", monto: 15_000 }, { rubro: "HERRAMIENTAS", moneda: "USD", monto: 1_500 }] }),
    corte("2027-01", "2027-01-01", "2027-01-31", { granularidad: "mes", cobros: { CRC: 0, USD: 99_999 } }),
  ],
  fechados: [
    { fechaISO: "2026-11-15", moneda: "USD", monto: 52_664, rubro: "COMISIONES", concepto: "HubSpot" },
    { fechaISO: "2026-11-20", moneda: "USD", monto: 2_000, rubro: "PAGOS", concepto: "Outsourcing" },
    { fechaISO: "2027-02-07", moneda: "USD", monto: 9_000, rubro: "PAGOS", concepto: "Después del cierre" },
  ],
  reservas: [{ id: "r1", concepto: "Diciembre", moneda: "USD", monto: 28_000, paraISO: "2026-12-20" }],
  ...cambios,
});

describe("proyectarCaja", () => {
  it("lo de cabeza de Marco: saldo + cobros + comisión − pagos − reservas = lo libre al cierre", () => {
    const p = proyectarCaja(entrada());
    expect(p.saldoHoy).toEqual({ CRC: 5_000_000, USD: 50_000 });
    expect(p.apartadoHoy).toEqual({ CRC: 0, USD: 28_000 });
    expect(p.libreHoy).toEqual({ CRC: 5_000_000, USD: 22_000 });
    // USD: 50.000 + 130.000 cobros + 52.664 comisión − 60.000 planilla − 3.000 herramientas − 2.000 pagos − 28.000 reserva
    expect(p.alCierre.libre).toEqual({ CRC: 6_000_000, USD: 139_664 });
    expect(p.alCierre.banco.USD).toBe(139_664); // la reserva ya salió el 20 de diciembre
    expect(p.alCierre.apartado.USD).toBe(0);
    expect(p.alCierre.libreEnUsd).toBe(151_664);
    expect(p.llegaAlCierre).toBe(true);
    expect(p.hastaISO).toBe("2026-12-31");
  });

  it("enero no entra: el cierre corta los cortes y lo fechado después", () => {
    const p = proyectarCaja(entrada());
    expect(p.cortes.map((c) => c.key)).not.toContain("2027-01");
    expect(p.fueraDelCierre).toBe(1);
  });

  it("una reserva deja de estar libre hoy, pero sale del banco el día que es para", () => {
    const p = proyectarCaja(entrada());
    const nov = p.cortes[0];
    expect(nov.apartadoAlFinal.USD).toBe(28_000);
    expect(nov.libreAlFinal.USD).toBe(nov.bancoAlFinal.USD - 28_000);
    const dic2 = p.cortes.find((c) => c.key === "2026-12-Q2")!;
    expect(dic2.reservasQueSalen.USD).toBe(28_000);
  });

  it("lo vencido y sin pagar se debe ya: cae en el primer corte", () => {
    const p = proyectarCaja(entrada({ fechados: [{ fechaISO: "2026-10-07", moneda: "USD", monto: 1_000, rubro: "PAGOS", concepto: "Atrasado" }] }));
    expect(p.cortes[0].sale.PAGOS.USD).toBe(1_000);
    expect(p.salidas.find((s) => s.concepto === "Atrasado")?.fechaISO).toBe("2026-11-13");
  });

  it("una cuenta sin saldo cuenta cero y se nombra", () => {
    const p = proyectarCaja(entrada({ saldos: [{ cuentaId: "x", nombre: "BCR", moneda: "CRC", monto: null, fechaISO: null }] }));
    expect(p.cuentasSinSaldo).toEqual(["BCR"]);
    expect(p.saldoHoy).toEqual({ CRC: 0, USD: 0 });
  });

  it("sin tipo de cambio no dice nada en dólares, y el faltante se mira por moneda", () => {
    const p = proyectarCaja(entrada({ crcPorUsd: null, saldos: [], fechados: [], reservas: [] }));
    expect(p.alCierre.libreEnUsd).toBeNull();
    expect(enDolares({ CRC: 1, USD: 1 }, null)).toBeNull();
    expect(p.primerFaltante).toBeNull();
  });

  it("detecta la primera quincena en que la plata no alcanza", () => {
    const p = proyectarCaja(entrada({ saldos: [], reservas: [], fechados: [], cortes: [corte("2026-11-Q2", "2026-11-16", "2026-11-30", { costos: [{ rubro: "PLANILLA", moneda: "USD", monto: 15_000 }] })] }));
    expect(p.primerFaltante?.key).toBe("2026-11-Q2");
    expect(p.primerFaltante?.libreEnUsd).toBe(-15_000);
  });

  it("los costos recurrentes viajan SUMADOS por rubro: una línea de planilla por corte y moneda, sin nombres", () => {
    const p = proyectarCaja(
      entrada({
        cortes: [corte("2026-11-Q2", "2026-11-16", "2026-11-30", { costos: [{ rubro: "PLANILLA", moneda: "USD", monto: 1_000 }, { rubro: "PLANILLA", moneda: "USD", monto: 2_000 }] })],
      }),
    );
    const planilla = p.salidas.filter((s) => s.rubro === "PLANILLA");
    expect(planilla).toHaveLength(1);
    expect(planilla[0].monto).toBe(3_000);
  });

  it("el cierre es el 31 de diciembre del año de hoy", () => {
    expect(cierreDelAnio("2026-11-13")).toBe("2026-12-31");
  });
});

describe("ordenarPagosSiNoAlcanza", () => {
  const s = (rubro: "PLANILLA" | "IMPUESTOS_Y_CARGAS" | "HERRAMIENTAS" | "PAGOS", monto: number, concepto: string) => ({
    corteKey: "2026-11-Q2",
    fechaISO: null,
    rubro,
    concepto,
    moneda: "USD" as const,
    monto,
  });

  it("primero la planilla, después impuestos, después proveedores y las herramientas al final", () => {
    const o = ordenarPagosSiNoAlcanza([s("HERRAMIENTAS", 100, "HubSpot"), s("PAGOS", 500, "Proveedor"), s("IMPUESTOS_Y_CARGAS", 300, "CCSS"), s("PLANILLA", 1_000, "Planilla")], { CRC: 0, USD: 1_400 }, 500);
    expect(o.pagos.map((p) => p.concepto)).toEqual(["Planilla", "CCSS", "Proveedor", "HubSpot"]);
    expect(o.pagos.map((p) => p.alcanza)).toEqual([true, true, false, false]);
    expect(o.faltanteEnUsd).toBe(600);
  });

  it("el orden es estricto: una herramienta chica no se paga mientras un proveedor espera", () => {
    const o = ordenarPagosSiNoAlcanza([s("PAGOS", 500, "Proveedor"), s("HERRAMIENTAS", 50, "Zoom")], { CRC: 0, USD: 100 }, 500);
    expect(o.pagos.find((p) => p.concepto === "Zoom")?.alcanza).toBe(false);
  });

  it("con colones y tipo de cambio junta las dos monedas en dólares", () => {
    const o = ordenarPagosSiNoAlcanza([{ ...s("PLANILLA", 500_000, "Planilla CRC"), moneda: "CRC" }], { CRC: 0, USD: 1_000 }, 500);
    expect(o.modo).toBe("EN_DOLARES");
    expect(o.pagos[0].alcanza).toBe(true);
    expect(o.pagos[0].quedaDespues).toBe(0);
  });
});

describe("pagosPorSemana", () => {
  const p = (clave: string, fechaISO: string | null, estimada: string, monto = 100): PagoDeLaSemana => ({
    clave,
    concepto: clave,
    beneficiario: null,
    tipo: "Otro",
    monto,
    moneda: "USD",
    fechaISO,
    fechaEstimadaISO: estimada,
    estado: fechaISO ? "PROGRAMADO" : "FALTA_LA_FACTURA",
    atrasado: fechaISO !== null && fechaISO < "2026-11-13",
    porQue: "",
    compromisoId: null,
    parte: null,
  });

  it("la semana de hoy junta lo atrasado; la siguiente solo su lunes a domingo; lo que espera va aparte", () => {
    const [esta, siguiente] = pagosPorSemana(
      [p("atrasado", "2026-11-07", "2026-11-13"), p("viernes", "2026-11-13", "2026-11-13"), p("lunes", "2026-11-16", "2026-11-16"), p("espera", null, "2026-11-20"), p("lejos", "2026-12-07", "2026-12-07")],
      "2026-11-13",
    );
    expect(esta.desdeISO).toBe("2026-11-09");
    expect(esta.pagos.map((x) => x.clave)).toEqual(["atrasado", "viernes"]);
    expect(esta.total.USD).toBe(200);
    expect(siguiente.pagos.map((x) => x.clave)).toEqual(["lunes"]);
    expect(siguiente.esperando.map((x) => x.clave)).toEqual(["espera"]);
  });
});
