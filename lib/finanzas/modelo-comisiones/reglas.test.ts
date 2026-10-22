import { describe, expect, it } from "vitest";
import {
  BONO_DE_CUSTOMER_SUCCESS,
  TECHOS,
  aQuienLeCuenta,
  bonoDeCustomerSuccess,
  bonoDeCustomerSuccessAlCien,
  bonoDeRenovacion,
  bonoDelAreaDeCustomerSuccess,
  bonoDelLider,
  bonoDelLiderPorPersona,
  comisionDeLicencia,
  metaDeCustomerSuccess,
  metaDelMes,
  pareceLicencia,
  porcentajeDelCumplimiento,
  renovacionesDelAnio,
  seCayoATiempo,
  simularVendedor,
  sumarMeses,
  techoDelTrimestre,
  type PeriodoSimulado,
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
  it("el 3 % corre por debajo del 50 %, para todos: el 50 % y el 100 % ya son del tramo de arriba", () => {
    expect(porcentajeDelCumplimiento(0.49)).toBe(3);
    expect(porcentajeDelCumplimiento(0.5)).toBe(4);
    expect(porcentajeDelCumplimiento(0.55)).toBe(4); // con el 60 % de la oferta de Liz sería 3 %
    expect(porcentajeDelCumplimiento(1)).toBe(5);
    expect(porcentajeDelCumplimiento(29900 / 30000)).toBe(4);
  });
});

describe("el bono de quien lidera Ventas", () => {
  it("los ejemplos de Elías: meta 10.000 y vende 8.000 → 133; meta 30.000: 18.000 → 0, 30.000 → 500, 50.000 → 750", () => {
    expect(bonoDelLiderPorPersona(8000, 10000)).toBeCloseTo(133.33, 2);
    expect(bonoDelLiderPorPersona(18000, 30000)).toBe(0);
    expect(bonoDelLiderPorPersona(30000, 30000)).toBe(500);
    expect(bonoDelLiderPorPersona(50000, 30000)).toBe(750);
  });
  it("desde el 70 % de SU meta, justo en el borde; sin meta, nada", () => {
    expect(bonoDelLiderPorPersona(21000, 30000)).toBe(350);
    expect(bonoDelLiderPorPersona(20999, 30000)).toBe(0);
    expect(bonoDelLiderPorPersona(5000, null)).toBe(0);
    expect(bonoDelLiderPorPersona(5000, 0)).toBe(0);
  });

  const mes = (numero: number, meta: number | null, vendido: number): PeriodoSimulado => ({
    clave: `2026-${String(numero).padStart(2, "0")}`,
    numero,
    enCurso: false,
    meta,
    vendido,
    cumplimiento: meta ? vendido / meta : null,
    porcentaje: 4,
    comision: 0,
    aDescontar: 0,
  });

  it("se suma mes por mes y persona por persona en cada trimestre; las ventas de quien lidera no entran", () => {
    const liz = { nombre: "Liz", periodos: [mes(1, 10000, 8000), mes(2, 20000, 10000), mes(3, 30000, 50000), mes(4, 30000, 30000)] };
    const t = bonoDelLider(4, [liz]);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ personas: 1, meta: 60000, vendido: 68000, mesesBajoElMinimo: 1, mesesConTope: 1 });
    expect(t[0].bono).toBeCloseTo(133.33 + 0 + 750, 2);
    expect(t[1]).toMatchObject({ enCurso: true, bono: 500 });
  });
  it("sin nadie con meta, no hay bono", () => {
    expect(bonoDelLider(4, [])[0]).toMatchObject({ personas: 0, bono: 0 });
    expect(bonoDelLider(2, [{ nombre: "Liz", periodos: [mes(1, null, 9000)] }])[0]).toMatchObject({ personas: 0, bono: 0 });
  });
});

describe("el bono de quien lidera Customer Success", () => {
  it("es el 2 % de la meta del trimestre, que sube por escalones", () => {
    const metas = BONO_DE_CUSTOMER_SUCCESS.escalera.map((e) => e.meta);
    expect(metas).toEqual([...metas].sort((a, b) => a - b));
    expect(bonoDeCustomerSuccessAlCien(25000)).toBe(500);
    expect(metaDeCustomerSuccess(1)).toBe(25000);
    expect(metaDeCustomerSuccess(9)).toBe(40000);
  });
  it("desde el 70 % y con tope del 150 %", () => {
    expect(bonoDeCustomerSuccess(25000, 17500)).toBe(350);
    expect(bonoDeCustomerSuccess(25000, 17499)).toBe(0);
    expect(bonoDeCustomerSuccess(25000, 100000)).toBe(750);
  });
  it("el ritmo de hoy es la base de 12 meses sin renovaciones, repartida en 4 trimestres", () => {
    const ritmo = BONO_DE_CUSTOMER_SUCCESS.base.expansion / 4;
    expect(Math.abs(BONO_DE_CUSTOMER_SUCCESS.escalera[1].meta - ritmo)).toBeLessThan(1000);
  });
  it("el área trimestre a trimestre: lo que creció contra su escalón", () => {
    const area = simularVendedor({
      anio: 2026,
      mesActual: 4,
      ventas: [venta({ id: "a", fecha: "2026-02-10", monto: 20000, primeraVenta: "2024-01-01" }), venta({ id: "b", fecha: "2026-04-02", monto: 9000, primeraVenta: "2024-01-01" })],
      tramos: [],
      area: "customerSuccess",
    });
    const t = bonoDelAreaDeCustomerSuccess(4, area.periodos);
    expect(t[0]).toMatchObject({ meta: 25000, vendido: 20000, bono: 400 });
    expect(t[1]).toMatchObject({ meta: 33000, vendido: 9000, bono: 0, enCurso: true });
  });
});

describe("licencias", () => {
  it("una licencia de 621 al mes paga 62,10 durante 3 meses: 186,30", () => {
    expect(comisionDeLicencia(621)).toBe(186.3);
  });
});

describe("a quién le cuenta una venta", () => {
  it("deducido: cliente nuevo, primeros 6 meses y expansión", () => {
    expect(aQuienLeCuenta(venta({ id: "a", fecha: "2026-05-05" }))).toEqual({ como: "clienteNuevo", parte: 1, deducido: true });
    expect(aQuienLeCuenta(venta({ id: "a", fecha: "2026-02-02", primeraVenta: "2025-12-23" })).como).toBe("primerosMeses");
    expect(aQuienLeCuenta(venta({ id: "a", fecha: "2026-01-30", primeraVenta: "2024-05-31" }))).toEqual({ como: "expansion", parte: 1, deducido: true });
  });
  it("lo que dice HubSpot manda: una renovación no cuenta; un nuevo marcado no se deduce", () => {
    expect(aQuienLeCuenta(venta({ id: "a", fecha: "2026-01-30", primeraVenta: "2024-05-31", tipoDeNegocio: "renovacion" }))).toEqual({ como: "renovacion", parte: 0, deducido: false });
    expect(aQuienLeCuenta(venta({ id: "a", fecha: "2026-01-30", primeraVenta: "2024-05-31", tipoDeNegocio: "nuevo" })).como).toBe("clienteNuevo");
  });
  it("compartida, la mitad; sin marca ya no se supone el 50 · 50", () => {
    expect(aQuienLeCuenta(venta({ id: "a", fecha: "2026-01-30", primeraVenta: "2024-05-31", compartidaCon: { id: "cse", nombre: "Caro" } })).parte).toBe(0.5);
  });
  it("sin empresa en Nexus cuenta como cliente nuevo de Ventas", () => {
    expect(aQuienLeCuenta(venta({ id: "a", fecha: "2026-01-13", cliente: null, primeraVenta: null }))).toEqual({ como: "sinEmpresa", parte: 1, deducido: true });
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
  const base = { anio: 2026, mesActual: 4, ventas, tramos: TRAMOS };

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

  it("una venta compartida paga la mitad y cuenta completa para la meta", () => {
    const s = simularVendedor({ ...base, ventas: ventas.map((v) => (v.id === "v3" ? { ...v, compartidaCon: { id: "cse", nombre: "Caro" } } : v)) });
    expect(s.servicios.find((x) => x.venta.id === "v3")!.comision).toBe(50);
    expect(s.periodos.find((p) => p.clave === "2026-03")!.vendido).toBe(33500);
  });

  it("una renovación no cuenta para la meta ni comisiona", () => {
    const s = simularVendedor({ ...base, ventas: ventas.map((v) => (v.id === "v3" ? { ...v, tipoDeNegocio: "renovacion" as const } : v)) });
    const mar = s.periodos.find((p) => p.clave === "2026-03")!;
    expect(mar.vendido).toBe(31500);
    expect(s.servicios.find((x) => x.venta.id === "v3")!.comision).toBeNull();
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

  it("Customer Success: el 5 % fijo, sin meta", () => {
    const s = simularVendedor({ ...base, tramos: [], area: "customerSuccess" });
    const mar = s.periodos.find((p) => p.clave === "2026-03")!;
    expect(mar.meta).toBeNull();
    expect(mar.porcentaje).toBe(5);
    expect(mar.comision).toBe(1675);
  });
});

describe("una venta que se cae", () => {
  // Marzo: meta de 31.000 (31 de los 90 días de 90.000).
  const ventas = [
    venta({ id: "a", fecha: "2026-03-02", monto: 26000 }),
    venta({ id: "b", fecha: "2026-03-05", monto: 6000, caida: { fecha: "2026-04-14", estado: "PERDIDA" } }),
  ];
  const base = { anio: 2026, mesActual: 5, ventas, tramos: TRAMOS };

  it("en sus primeros 90 días se resta del mes en que se firmó, y la diferencia se descuenta", () => {
    const s = simularVendedor(base);
    const mar = s.periodos.find((p) => p.clave === "2026-03")!;
    expect(mar.vendido).toBe(26000);
    expect(mar.porcentaje).toBe(4);
    expect(mar.comision).toBe(1040);
    // Con la venta: 32.000 de 31.000, 5 % de todo = 1.600. Sin ella: 1.040. Se descuentan 560.
    expect(mar.aDescontar).toBe(560);
    expect(s.totalADescontar).toBe(560);
    expect(s.servicios.find((x) => x.venta.id === "b")).toMatchObject({ seCayo: true, comision: null });
  });

  it("pasados los 90 días no se descuenta nada", () => {
    expect(seCayoATiempo(venta({ id: "x", fecha: "2026-03-05", caida: { fecha: "2026-07-01", estado: "PERDIDA" } }))).toBe(false);
    expect(seCayoATiempo(venta({ id: "x", fecha: "2026-03-05", caida: { fecha: "2026-06-03", estado: "REABIERTA" } }))).toBe(true);
  });

  it("se puede marcar a mano (un servicio que se dejó de pagar sin que HubSpot cambie)", () => {
    const s = simularVendedor({ ...base, ventas: [ventas[0]], ajustes: { a: { seCayo: true } } });
    expect(s.periodos.find((p) => p.clave === "2026-03")!).toMatchObject({ vendido: 0, comision: 0, aDescontar: 1040 });
  });
});

describe("las renovaciones", () => {
  it("el 2 % de un año, solo a tiempo y sin descuento", () => {
    expect(bonoDeRenovacion(25200, true, 0)).toBe(504);
    expect(bonoDeRenovacion(25200, false, 0)).toBe(0);
    expect(bonoDeRenovacion(25200, true, 100)).toBe(0);
  });
  it("los tratos marcados renovación y cada aniversario de un servicio mensual sin fin", () => {
    const r = renovacionesDelAnio({
      anio: 2026,
      mesActual: 10,
      tratos: [venta({ id: "acccsa", fecha: "2026-01-15", monto: 25200, tipoDeNegocio: "renovacion" }), venta({ id: "otra", fecha: "2026-02-01", monto: 9000 })],
      mensuales: [{ id: "sop", cliente: "Wherex", nombre: "Soporte", inicio: "2024-06-01", mensual: 1000, moneda: "USD", encargado: { id: "cse", nombre: "Caro" } }],
      ajustes: { "sop:2": { aTiempo: false } },
    });
    expect(r.map((x) => x.id)).toEqual(["acccsa", "sop:2"]);
    expect(r[0]).toMatchObject({ valorDelAnio: 25200, bono: 504, aTiempo: true, aTiempoEscrito: false });
    expect(r[1]).toMatchObject({ fecha: "2026-06-01", valorDelAnio: 12000, bono: 0, aTiempo: false });
  });
});

describe("los techos", () => {
  it("7 % para quienes atienden al cliente y 10 % en total", () => {
    expect(TECHOS).toEqual({ quienesAtienden: 7, total: 10 });
    expect(techoDelTrimestre(1, false, 100000, 6500)).toMatchObject({ porcentaje: 6.5, pasaQuienesAtienden: false, pasaElTotal: false });
    expect(techoDelTrimestre(1, false, 100000, 8000)).toMatchObject({ pasaQuienesAtienden: true, pasaElTotal: false });
    expect(techoDelTrimestre(1, false, 0, 0).porcentaje).toBeNull();
  });
});
