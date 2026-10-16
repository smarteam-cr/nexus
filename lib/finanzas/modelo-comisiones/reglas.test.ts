import { describe, expect, it } from "vitest";
import {
  DECISIONES_DE_LA_PROPUESTA,
  aQuienLeCuenta,
  bonoDelLider,
  bonoTrimestral,
  comisionDeLicencia,
  metaDelMes,
  pareceLicencia,
  porcentajeDelCumplimiento,
  simularVendedor,
  sumarMeses,
  type TramoDeMeta,
  type VentaParaSimular,
} from "./reglas";

const venta = (p: Partial<VentaParaSimular> & { id: string; fecha: string }): VentaParaSimular => ({
  nombre: "Implementación",
  cliente: "Cliente",
  monto: 1000,
  moneda: "USD",
  refiereHubspot: false,
  primeraVenta: p.fecha,
  ...p,
});

// La meta de Andrés en HubSpot: trimestral.
const TRAMOS: TramoDeMeta[] = [
  { desde: "2026-01-01", hasta: "2026-04-01", monto: 90000, avance: 34400 },
  { desde: "2026-04-01", hasta: "2026-07-01", monto: 75000, avance: 102730 },
];

describe("los tramos de la comisión por venta", () => {
  it("cumplimiento → porcentaje, con los ejemplos de la propuesta (meta de 30.000)", () => {
    expect(porcentajeDelCumplimiento(14000 / 30000)).toBe(3);
    expect(porcentajeDelCumplimiento(25000 / 30000)).toBe(4);
    expect(porcentajeDelCumplimiento(31500 / 30000)).toBe(5);
  });
  it("el 50 % y el 100 % ya son del tramo de arriba: 30.000 de 30.000 paga 5 %", () => {
    expect(porcentajeDelCumplimiento(0.5)).toBe(4);
    expect(porcentajeDelCumplimiento(1)).toBe(5);
    expect(porcentajeDelCumplimiento(29900 / 30000)).toBe(4);
  });
});

describe("licencias y bono", () => {
  it("una licencia de 621 al mes paga 62,10 durante 3 meses: 186,30", () => {
    expect(comisionDeLicencia(621)).toBe(186.3);
  });
  it("el bono con una persona liderada (1.500 al trimestre): cero bajo el 70 %, proporcional en el medio, con tope", () => {
    expect(bonoTrimestral(1500, 0.69)).toBe(0);
    expect(bonoTrimestral(1500, 0.8)).toBeCloseTo(1200);
    expect(bonoTrimestral(1500, 2.5)).toBe(3000);
    expect(bonoTrimestral(1500, 2.5, 1.5)).toBe(2250);
  });
});

describe("a quién le cuenta una venta", () => {
  it("cliente nuevo, primeros 6 meses y expansión", () => {
    expect(aQuienLeCuenta(venta({ id: "a", fecha: "2026-05-05" }), "completa").como).toBe("clienteNuevo");
    expect(aQuienLeCuenta(venta({ id: "a", fecha: "2026-02-02", primeraVenta: "2025-12-23" }), "completa").como).toBe("primerosMeses");
    const exp = aQuienLeCuenta(venta({ id: "a", fecha: "2026-01-30", primeraVenta: "2024-05-31" }), "mitad");
    expect(exp).toEqual({ como: "expansion", parte: 0.5 });
    expect(aQuienLeCuenta(venta({ id: "a", fecha: "2026-01-30", primeraVenta: "2024-05-31" }), "completa").parte).toBe(1);
  });
  it("sin empresa en Nexus cuenta como cliente nuevo de Ventas", () => {
    expect(aQuienLeCuenta(venta({ id: "a", fecha: "2026-01-13", cliente: null, primeraVenta: null }), "mitad")).toEqual({ como: "sinEmpresa", parte: 1 });
  });
  it("sumarMeses cruza el año", () => {
    expect(sumarMeses("2025-12-23", 6)).toBe("2026-06-23");
    expect(sumarMeses("2026-09-16", 6)).toBe("2027-03-16");
  });
  it("lo que parece licencia por el nombre", () => {
    expect(pareceLicencia("Selvatura - Licencias adicionales Sales Hub")).toBe(true);
    expect(pareceLicencia("Datalysis - MHP, SHP, SHP")).toBe(true);
    expect(pareceLicencia("2 sillas de ventas | FACO HONDA")).toBe(true);
    expect(pareceLicencia("ECOQUINTAS - Web")).toBe(false);
  });
});

describe("la meta de un mes", () => {
  it("un tramo trimestral se reparte por días, como el desglose mensual de HubSpot", () => {
    const andres: TramoDeMeta[] = [
      { desde: "2026-01-01", hasta: "2026-04-01", monto: 70000, avance: null },
      { desde: "2026-04-01", hasta: "2026-07-01", monto: 75000, avance: null },
    ];
    expect(metaDelMes(andres, "2026-01")).toBeCloseTo(24111.11, 2);
    expect(metaDelMes(andres, "2026-02")).toBeCloseTo(21777.78, 2);
    expect(metaDelMes(andres, "2026-05")).toBeCloseTo(25549.45, 2);
    expect(metaDelMes(andres, "2026-09")).toBeNull();
  });
});

describe("la simulación de un vendedor", () => {
  const ventas = [
    venta({ id: "v1", fecha: "2026-02-03", monto: 13000 }),
    venta({ id: "v2", fecha: "2026-03-10", monto: 31500 }),
    venta({ id: "v3", fecha: "2026-03-20", monto: 2000, primeraVenta: "2024-01-10" }),
    venta({ id: "lic", fecha: "2026-03-21", nombre: "Licencias Sales Pro", monto: null }),
    venta({ id: "crc", fecha: "2026-03-22", monto: 3_000_000, moneda: "CRC" }),
  ];
  const base = { anio: 2026, mesActual: 4, ventas, tramos: TRAMOS, decisiones: DECISIONES_DE_LA_PROPUESTA };

  it("cada mes con su porcentaje, aplicado a todo lo del mes", () => {
    const s = simularVendedor(base);
    const feb = s.periodos.find((p) => p.clave === "2026-02")!;
    const mar = s.periodos.find((p) => p.clave === "2026-03")!;
    expect(feb.porcentaje).toBe(3);
    expect(feb.comision).toBe(390); // 13.000 de 28.000 (febrero tiene 28 de los 90 días)
    expect(mar.vendido).toBe(33500); // la venta en colones y la licencia no suman
    expect(mar.porcentaje).toBe(5);
    expect(mar.comision).toBe(1675);
    expect(s.periodos.at(-1)!.enCurso).toBe(true);
    expect(s.servicios.find((x) => x.venta.id === "crc")!.tipo).toBe("otraMoneda");
    expect(s.conElPorcentajeDeHoy).toBe(2325);
  });

  it("la expansión 50 · 50 parte a la mitad solo lo de después de los 6 meses", () => {
    const s = simularVendedor({ ...base, decisiones: { ...DECISIONES_DE_LA_PROPUESTA, expansion: "mitad" } });
    expect(s.servicios.find((x) => x.venta.id === "v3")!.comision).toBe(50);
    expect(s.servicios.find((x) => x.venta.id === "v2")!.comision).toBe(1575);
  });

  it("por trimestre, el cumplimiento se mide con la meta del trimestre", () => {
    const s = simularVendedor({ ...base, decisiones: { ...DECISIONES_DE_LA_PROPUESTA, medida: "trimestre" } });
    expect(s.periodos.map((p) => p.clave)).toEqual(["2026-T1", "2026-T2"]);
    expect(s.periodos[0].vendido).toBe(46500);
    expect(s.periodos[0].porcentaje).toBe(4);
  });

  it("una licencia sin valor no paga; con valor y traída por Smarteam, 10 % × 3", () => {
    expect(simularVendedor(base).totalPorLicencias).toBe(0);
    const s = simularVendedor({ ...base, ajustes: { lic: { valorMensual: 621 } } });
    expect(s.totalPorLicencias).toBe(186.3);
    const hs = simularVendedor({ ...base, ajustes: { lic: { valorMensual: 621, laTrajoSmarteam: false } } });
    expect(hs.totalPorLicencias).toBe(0);
  });

  it("las licencias no suman a la meta: la meta es solo de servicios", () => {
    const s = simularVendedor({ ...base, ajustes: { lic: { valorMensual: 100 } } });
    expect(s.periodos.find((p) => p.clave === "2026-03")!.vendido).toBe(33500);
  });

  it("corregir una venta a licencia la saca de los servicios", () => {
    const s = simularVendedor({ ...base, ajustes: { v1: { tipo: "licencia" } } });
    expect(s.servicios.some((x) => x.venta.id === "v1")).toBe(false);
    expect(s.licencias.some((x) => x.venta.id === "v1")).toBe(true);
  });
});

describe("el bono de quien lidera", () => {
  const liz: TramoDeMeta[] = [
    { desde: "2026-01-01", hasta: "2026-04-01", monto: 90000, avance: 90000 },
    { desde: "2026-04-01", hasta: "2026-07-01", monto: 90000, avance: 60000 },
  ];
  it("US$ 500 al mes por persona liderada que llega a su meta; el trimestre de hoy todavía no paga", () => {
    const t = bonoDelLider(2026, 5, [liz]);
    expect(t[0].personas).toBe(1);
    expect(t[0].base).toBe(1500);
    expect(t[0].bono).toBe(1500);
    expect(t[1].enCurso).toBe(true);
    expect(t[1].bono).toBeNull();
  });
  it("bajo el 70 % no hay bono", () => {
    const t = bonoDelLider(2026, 7, [liz]);
    expect(t[1].cumplimiento).toBeCloseTo(0.667, 2);
    expect(t[1].bono).toBe(0);
  });
  it("sin nadie con meta, no hay bono", () => {
    expect(bonoDelLider(2026, 4, [])[0]).toMatchObject({ personas: 0, base: 0, bono: 0 });
  });
});
