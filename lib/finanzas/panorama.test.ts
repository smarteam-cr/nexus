/**
 * lib/finanzas/panorama.test.ts — el panorama del dinero (2026-11-13, pedidos de Finanzas 2, 3, 5 y 27).
 *
 * Lo que importa: que el gasto del mes en curso no parezca bajo el día 1 (se proyecta con lo fijo), que no cuente la
 * planilla dos veces al proyectar (máximo por rubro, no suma), que un mes cerrado diga quién lo confirmó, que el
 * colchón no se escape de un número sensato y que el filtro de fechas no salga del año.
 */
import { describe, expect, it } from "vitest";
import type { FilaMes, RubroEgreso } from "./equilibrio";
import {
  areaDeQuienVendio,
  COLCHON_POR_DEFECTO,
  fueraDelRangoAcordado,
  gastoDelMes,
  gastosDelAnio,
  lecturaDeLasTandas,
  mesesDelRango,
  normalizarColchon,
  pisoConColchon,
  rangoDePreset,
  rangoValido,
  textoDeFirmeza,
} from "./panorama";

const cero = (): Record<RubroEgreso, number> => ({
  PLANILLA: 0,
  HERRAMIENTA: 0,
  FIJO_OPERACION: 0,
  TARJETA: 0,
  RESERVA_AGUINALDO: 0,
  LICENCIA: 0,
  FINANCIERO: 0,
});
const mes = (periodo: string, porRubro: Partial<Record<RubroEgreso, number>>): Pick<FilaMes, "periodo" | "egresos" | "egresosPorRubro"> => {
  const egresosPorRubro = { ...cero(), ...porRubro };
  return { periodo, egresosPorRubro, egresos: Object.values(egresosPorRubro).reduce((a, b) => a + b, 0) };
};
/** El piso de hoy de producción, redondeado (2026-11-13). */
const PISO = { porRubro: { ...cero(), PLANILLA: 33_404, HERRAMIENTA: 2_533, FIJO_OPERACION: 2_111, RESERVA_AGUINALDO: 1_658 } };
const HOY = "2026-11-13";

describe("el gasto del mes, con su firmeza", () => {
  it("un mes cerrado es REAL y dice quién lo confirmó y cuándo", () => {
    const g = gastoDelMes(mes("2026-10", { PLANILLA: 32_221, HERRAMIENTA: 2_647 }), {
      hoyISO: HOY,
      piso: PISO,
      cierre: { periodo: "2026-10", cerradoEn: "2026-11-09", cerradoPor: "Alexander", cambio: false },
    });
    expect(g.firmeza).toBe("REAL");
    expect(g.monto).toBe(34_868);
    expect(g.confirmadoPor).toBe("Alexander");
    expect(g.confirmadoEn).toBe("2026-11-09");
  });

  it("un mes que pasó sin cerrar es REGISTRADO: lo anotado, sin proyectar", () => {
    const g = gastoDelMes(mes("2026-09", { PLANILLA: 26_075 }), { hoyISO: HOY, piso: PISO });
    expect(g).toMatchObject({ firmeza: "REGISTRADO", monto: 26_075 });
  });

  it("EL DÍA 1: el mes en curso sin nada anotado se proyecta con lo fijo, no queda en cero", () => {
    const g = gastoDelMes(mes("2026-11", {}), { hoyISO: "2026-11-01", piso: PISO });
    expect(g.firmeza).toBe("PROYECTADO");
    expect(g.monto).toBe(33_404 + 2_533 + 2_111 + 1_658);
    expect(g.anotado).toBe(0);
  });

  it("a mitad de mes NO suma la quincena anotada al piso: por rubro manda el mayor (la planilla no se cuenta dos veces)", () => {
    const g = gastoDelMes(mes("2026-11", { PLANILLA: 16_675, HERRAMIENTA: 2_533, FIJO_OPERACION: 2_111, RESERVA_AGUINALDO: 1_674 }), {
      hoyISO: HOY,
      piso: PISO,
    });
    expect(g.monto).toBe(33_404 + 2_533 + 2_111 + 1_674);
    expect(g.anotado).toBe(16_675 + 2_533 + 2_111 + 1_674);
  });

  it("lo anotado que el piso no tiene (un gasto financiero, una licencia) también entra al proyectado", () => {
    const g = gastoDelMes(mes("2026-11", { FINANCIERO: 80, LICENCIA: 500 }), { hoyISO: HOY, piso: PISO });
    expect(g.monto).toBe(33_404 + 2_533 + 2_111 + 1_658 + 80 + 500);
  });

  it("un mes por venir también se proyecta", () => {
    expect(gastoDelMes(mes("2026-12", { HERRAMIENTA: 2_533 }), { hoyISO: HOY, piso: PISO }).firmeza).toBe("PROYECTADO");
  });

  it("sin piso de hoy no se inventa la proyección: queda lo registrado", () => {
    expect(gastoDelMes(mes("2026-11", { PLANILLA: 100 }), { hoyISO: HOY, piso: null })).toMatchObject({ firmeza: "REGISTRADO", monto: 100 });
  });

  it("un mes cerrado manda sobre la proyección aunque sea el mes en curso", () => {
    const g = gastoDelMes(mes("2026-11", { PLANILLA: 10 }), {
      hoyISO: HOY,
      piso: PISO,
      cierre: { periodo: "2026-11", cerradoEn: "2026-11-12", cambio: true },
    });
    expect(g).toMatchObject({ firmeza: "REAL", monto: 10, cambioDespuesDelCierre: true, confirmadoPor: null });
  });

  it("gastosDelAnio pone a cada mes su cierre", () => {
    const gs = gastosDelAnio([mes("2026-10", { PLANILLA: 1 }), mes("2026-11", {})], {
      hoyISO: HOY,
      piso: PISO,
      cierres: [{ periodo: "2026-10", cerradoEn: "2026-11-09", cerradoPor: "Alex", cambio: false }],
    });
    expect(gs.map((g) => g.firmeza)).toEqual(["REAL", "PROYECTADO"]);
  });

  it("la firmeza en palabras", () => {
    const usd = (n: number) => `$${n}`;
    const fecha = (iso: string) => `[${iso}]`;
    const real = gastoDelMes(mes("2026-10", { PLANILLA: 5 }), {
      hoyISO: HOY,
      piso: PISO,
      cierre: { periodo: "2026-10", cerradoEn: "2026-11-09", cerradoPor: "Alex", cambio: false },
    });
    expect(textoDeFirmeza(real, usd, fecha)).toBe("Real: confirmado por Alex al cerrar el mes el [2026-11-09].");
    expect(textoDeFirmeza(gastoDelMes(mes("2026-11", { PLANILLA: 7 }), { hoyISO: HOY, piso: PISO }), usd, fecha)).toBe(
      "Proyectado con lo fijo que ya se conoce. Anotado hasta hoy: $7.",
    );
  });
});

describe("el colchón del piso", () => {
  it("arranca en 15 % y el rango acordado es 10 a 15 %", () => {
    expect(COLCHON_POR_DEFECTO).toBe(15);
    expect(fueraDelRangoAcordado(10)).toBe(false);
    expect(fueraDelRangoAcordado(15)).toBe(false);
    expect(fueraDelRangoAcordado(5)).toBe(true);
    expect(fueraDelRangoAcordado(20)).toBe(true);
  });

  it("lo que no se puede leer vuelve al de por defecto; lo demás queda entre 0 y 50, entero", () => {
    expect(normalizarColchon("")).toBe(15);
    expect(normalizarColchon("abc")).toBe(15);
    expect(normalizarColchon(undefined)).toBe(15);
    expect(normalizarColchon("12,4")).toBe(12);
    expect(normalizarColchon(-3)).toBe(0);
    expect(normalizarColchon(400)).toBe(50);
  });

  it("el mínimo con colchón es el piso × (1 + colchón)", () => {
    expect(pisoConColchon(39_706.65, 15)).toBe(45_662.65);
    expect(pisoConColchon(40_000, 10)).toBe(44_000);
    expect(pisoConColchon(1000, 0)).toBe(1000);
  });
});

describe("el filtro de fechas", () => {
  it("los atajos terminan en el mes en curso", () => {
    expect(rangoDePreset("anio", 2026, HOY)).toEqual({ desde: "2026-01", hasta: "2026-12" });
    expect(rangoDePreset("loQueVa", 2026, HOY)).toEqual({ desde: "2026-01", hasta: "2026-11" });
    expect(rangoDePreset("seis", 2026, HOY)).toEqual({ desde: "2026-06", hasta: "2026-11" });
    expect(rangoDePreset("tres", 2026, HOY)).toEqual({ desde: "2026-09", hasta: "2026-11" });
  });

  it("en enero, «últimos 6» no se sale del año; en un año que ya terminó, termina en diciembre", () => {
    expect(rangoDePreset("seis", 2026, "2026-01-20")).toEqual({ desde: "2026-01", hasta: "2026-01" });
    expect(rangoDePreset("tres", 2025, HOY)).toEqual({ desde: "2025-10", hasta: "2025-12" });
  });

  it("un rango al revés se da vuelta y uno de otro año vuelve al año", () => {
    expect(rangoValido({ desde: "2026-09", hasta: "2026-03" }, 2026)).toEqual({ desde: "2026-03", hasta: "2026-09" });
    expect(rangoValido({ desde: "2025-09", hasta: "basura" }, 2026)).toEqual({ desde: "2026-01", hasta: "2026-12" });
  });

  it("los meses del rango conservan su índice en el año", () => {
    const meses = ["2026-01", "2026-02", "2026-03", "2026-04"].map((periodo) => ({ periodo }));
    expect(mesesDelRango(meses, { desde: "2026-02", hasta: "2026-03" })).toEqual([
      { m: { periodo: "2026-02" }, i: 1 },
      { m: { periodo: "2026-03" }, i: 2 },
    ]);
  });
});

describe("las dos tandas de la facturación", () => {
  it("en el mes en curso dice lo facturado y lo que falta de la segunda tanda", () => {
    expect(lecturaDeLasTandas({ periodo: "2026-11", facturado: 4_360, pendienteFacturar: 30_000 }, HOY)).toEqual({
      facturadoHastaHoy: 4_360,
      faltaFacturar: 30_000,
      segundaTandaPendiente: true,
    });
  });

  it("un mes que ya pasó no se lee por tandas", () => {
    expect(lecturaDeLasTandas({ periodo: "2026-10", facturado: 86_961, pendienteFacturar: 0 }, HOY)).toBeNull();
  });
});

describe("quién vendió", () => {
  it("CSE y CSL son Customer Success, la misma regla que las comisiones", () => {
    expect(areaDeQuienVendio("CSE")).toBe("Customer Success");
    expect(areaDeQuienVendio("CSL")).toBe("Customer Success");
    expect(areaDeQuienVendio("VENTAS")).toBe("Ventas");
    expect(areaDeQuienVendio("SUPER_ADMIN")).toBe("Dirección y otros");
    expect(areaDeQuienVendio(null)).toBe("Sin dueño en Nexus");
  });
});
