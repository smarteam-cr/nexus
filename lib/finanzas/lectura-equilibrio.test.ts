/**
 * lib/finanzas/lectura-equilibrio.test.ts — lo que la página del punto de equilibrio contesta arriba de todo
 * (rediseño para RevOps, CFO y CEO, 2026-10-05). El caso es 2026 tal como estaba el 4 de octubre.
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { describe, it, expect } from "vitest";
import type { FilaMes, ReporteEquilibrio, RubroEgreso } from "./equilibrio";
import {
  desgloseDelMargen,
  estadoDelMes,
  loQueViene,
  porQueEsPreliminar,
  rangoDeMeses,
  respuestaDelAnio,
  simular,
} from "./lectura-equilibrio";
import { armarAgenda, rolDeLinea } from "./agenda-equilibrio";
import { detectarInconsistencias, type Inconsistencia } from "./inconsistencias";

const rubros = (r: Partial<Record<RubroEgreso, number>> = {}): Record<RubroEgreso, number> => ({
  PLANILLA: 0, HERRAMIENTA: 0, FIJO_OPERACION: 0, TARJETA: 0, RESERVA_AGUINALDO: 0, ...r,
});

// [periodo, facturado, aliados, ingresosTotales, egresos, programado sin factura, estado, faltantes]
const DATOS: Array<[string, number, number, number, number, number, "COMPLETO" | "PARCIAL", string[]]> = [
  ["2026-01", 35595, 0, 35595, 15904, 0, "PARCIAL", ["costos fijos", "tarjetas"]],
  ["2026-02", 30372, 41553, 71925, 15904, 0, "PARCIAL", ["costos fijos", "tarjetas"]],
  ["2026-03", 34349, 0, 34349, 15904, 0, "PARCIAL", ["costos fijos", "tarjetas"]],
  ["2026-04", 19279, 0, 19279, 22928, 0, "COMPLETO", []],
  ["2026-05", 15800, 48771, 64571, 22726, 0, "COMPLETO", []],
  ["2026-06", 16449, 0, 16449, 22771, 2975, "COMPLETO", []],
  ["2026-07", 33860, 0, 33860, 22800, 1000, "COMPLETO", []],
  ["2026-08", 23550, 0, 23550, 14459, 6163, "PARCIAL", ["planilla-q2"]],
  ["2026-09", 65089, 0, 65089, 5267, 14043, "PARCIAL", ["planilla"]],
  ["2026-10", 8806, 0, 8806, 5008, 28468, "PARCIAL", ["planilla", "gastos del mes sin confirmar"]],
  ["2026-11", 0, 0, 0, 5008, 28556, "PARCIAL", ["planilla", "gastos del mes sin confirmar"]],
  ["2026-12", 0, 0, 0, 5008, 13668, "PARCIAL", ["planilla", "gastos del mes sin confirmar"]],
];
const HOY = "2026-10-04";

const meses: FilaMes[] = DATOS.map(([periodo, facturado, aliados, ingresos, egresos, pendiente, estado, faltantes], i) => ({
  periodo,
  mes: i + 1,
  egresos,
  egresosPorRubro: rubros({ PLANILLA: periodo === "2026-07" ? 17504 : 0 }),
  facturado,
  cobrado: 0,
  porCobrar: 0,
  porCobrarVencido: 0,
  pendienteFacturar: pendiente,
  partnership: aliados,
  partnershipCobrado: aliados,
  partnershipProyectado: periodo === "2026-11" ? 53849 : 0,
  partnershipEnIngresos: aliados,
  noVenta: 0,
  noVentaCobrado: 0,
  ingresosTotales: ingresos,
  vendido: 0,
  brecha: ingresos - egresos,
  cubreEgresos: estado === "COMPLETO" ? ingresos >= egresos : null,
  facturadoPorServicio: {},
  estado,
  futuro: periodo > "2026-10",
  faltantes,
}));

const reporte = {
  meses,
  pisoVigente: { base: 34674.26, cuantos: 48, noConvertidos: [], metas: [{ colchonPct: 10, monto: 38141.69, etiqueta: "" }], porRubro: rubros({ PLANILLA: 29536 }) },
  equilibrio: { base: 22806.24, metas: [] },
  indicadores: {
    mesesDelMargen: ["2026-04", "2026-05", "2026-06", "2026-07"],
    margenAlDia: 42934.66,
    cajaAlDia: 123159.62,
    egresosDeCajaTotal: 86822.04,
  },
} as unknown as Pick<ReporteEquilibrio, "meses" | "pisoVigente" | "equilibrio" | "indicadores">;

describe("rangoDeMeses", () => {
  it("corridos como rango, sueltos como lista, uno solo por su nombre", () => {
    expect(rangoDeMeses(["2026-07", "2026-04", "2026-05", "2026-06"])).toBe("abril a julio");
    expect(rangoDeMeses(["2026-01", "2026-03"])).toBe("enero y marzo");
    expect(rangoDeMeses(["2026-08"])).toBe("agosto");
  });
});

describe("la respuesta: ¿alcanza lo facturado para el piso?", () => {
  const r = respuestaDelAnio(reporte, HOY)!;
  it("promedia los meses que ya terminaron, sin el mes en curso", () => {
    expect(r.meses).toHaveLength(9);
    expect(r.promedioFacturado).toBe(30482.56);
  });
  it("sin los aliados falta; con lo que pagaron, sobra", () => {
    expect(r.faltaSinAliados).toBe(4191.7);
    expect(r.promedioConAliados).toBe(40518.56);
    expect(r.sobraConAliados).toBe(5844.3);
    expect(r.mesesConAliados).toEqual(["2026-02", "2026-05"]);
  });
});

describe("el margen a la fecha, desarmado", () => {
  const d = desgloseDelMargen(reporte)!;
  it("ingresos menos el gasto de los meses del margen", () => {
    expect(d.ingresos).toBe(134159);
    expect(d.facturado).toBe(85388);
    expect(d.aliados).toBe(48771);
    expect(d.gasto).toBe(91225);
  });
  it("sin los aliados es negativo, y la caja se dice aparte", () => {
    expect(d.sinAliados).toBe(-5836.34);
    expect(d.caja).toBe(36337.58);
  });
});

describe("¿por qué es preliminar?", () => {
  it("dice qué meses cuenta y por qué no los otros, que ninguno está cerrado y que nadie confirmó el tipo de cambio", () => {
    const p = porQueEsPreliminar(reporte, HOY, new Set(), new Set(), 500);
    expect(p.preliminar).toBe(true);
    expect(p.razones[0]).toBe(
      "Solo cuenta abril a julio: son los únicos meses con el gasto completo. Enero a marzo, sin costos fijos ni tarjetas; agosto, sin la 2ª quincena de planilla; septiembre, sin la planilla.",
    );
    expect(p.razones[1]).toBe("Ninguno de esos 4 meses está cerrado por el CFO.");
    expect(p.razones[2]).toBe("Usa ₡500 por dólar y nadie lo confirmó.");
    expect(p.cuando).toBe("Deja de ser preliminar cuando el CFO cierre abril a julio y confirme el tipo de cambio.");
  });
  it("con los cuatro cerrados y el tipo de cambio confirmado deja de serlo", () => {
    const todos = new Set(["2026-04", "2026-05", "2026-06", "2026-07"]);
    const p = porQueEsPreliminar(reporte, HOY, todos, todos, 500);
    expect(p.preliminar).toBe(false);
    expect(p.cuando).toBe("");
  });
  it("si solo faltan algunos, los nombra", () => {
    const p = porQueEsPreliminar(reporte, HOY, new Set(["2026-04", "2026-05"]), new Set(["2026-04", "2026-05", "2026-06", "2026-07"]), 500);
    expect(p.razones).toContain("Junio a julio no están cerrados por el CFO.");
  });
});

describe("lo que viene", () => {
  it("del mes en curso a diciembre: facturado y programado contra el piso de esos meses", () => {
    const v = loQueViene(reporte, HOY)!;
    expect(v.meses).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(v.facturadoYProgramado).toBe(79498);
    expect(v.pisoDelPeriodo).toBe(104022.78);
    expect(v.falta).toBe(24524.78);
  });
});

describe("el estado de cada mes", () => {
  const de = (p: string, cierre?: { cambio: boolean | null }) => estadoDelMes(meses.find((m) => m.periodo === p)!, cierre, HOY);
  it("por venir, en curso, sin cerrar, cerrado y cambiado", () => {
    expect(de("2026-11").clave).toBe("porVenir");
    expect(de("2026-10").clave).toBe("enCurso");
    expect(de("2026-05").clave).toBe("sinCerrar");
    expect(de("2026-05", { cambio: false }).clave).toBe("cerrado");
    expect(de("2026-05", { cambio: true }).clave).toBe("cambio");
  });
  it("lo que falta se distingue: la planilla, o el resto del gasto", () => {
    expect(de("2026-08")).toMatchObject({ clave: "faltaPlanilla", incompleto: true, detalle: "Gasto incompleto: sin la 2ª quincena de planilla." });
    expect(de("2026-02")).toMatchObject({ clave: "faltaGasto", detalle: "Gasto incompleto: sin costos fijos ni tarjetas." });
  });
});

describe("¿y si…?", () => {
  const base = [
    { periodo: "2026-10", facturado: 37274, estimadoAliados: 0 },
    { periodo: "2026-11", facturado: 28556, estimadoAliados: 53849 },
    { periodo: "2026-12", facturado: 13668, estimadoAliados: 0 },
  ];
  it("con lo programado faltan US$24.525 en el trimestre", () => {
    const s = simular(base, 34674.26, { contarEstimado: false, costoExtra: 0 });
    expect(s.diferencia).toBe(-24524.78);
    expect(s.faltaPorMes).toBe(8175);
    expect(s.meses.map((m) => m.alcanza)).toEqual([true, false, false]);
  });
  it("contando lo estimado de aliados, sobra; un costo nuevo sube el piso de cada mes", () => {
    expect(simular(base, 34674.26, { contarEstimado: true, costoExtra: 0 }).diferencia).toBe(29324.22);
    expect(simular(base, 34674.26, { contarEstimado: false, costoExtra: 2000 }).pisoDelPeriodo).toBe(110022.78);
  });
});

describe("la agenda: cada punto con quien lo decide", () => {
  const linea = (codigo: string, titulo = codigo, monto: number | null = null): Inconsistencia => ({
    codigo, severidad: "MEDIA", titulo, detalle: "", montoEnJuego: monto, queHacer: "hacer algo", resuelve: "DIRECCION", items: [],
  });
  it("los aliados sin decidir van primero, al CEO; los meses para cerrar, al CFO", () => {
    const a = armarAgenda({ inconsistencias: [], aliadosDecidido: false, aliadosDecidenElResultado: true, mesesParaCerrar: ["2026-07", "2026-04", "2026-05", "2026-06"] });
    expect(a.map((p) => [p.rol, p.pregunta])).toEqual([
      ["CEO", "¿Lo que pagan los aliados cuenta para cubrir el piso?"],
      ["CFO", "Cerrar abril a julio"],
    ]);
    expect(a[1]!.accion).toEqual({ tipo: "enlace", href: "/finanzas/cierre?mes=2026-04", etiqueta: "Ir al cierre" });
  });
  it("decidido, lo de los aliados sale de la agenda", () => {
    expect(armarAgenda({ inconsistencias: [], aliadosDecidido: true, aliadosDecidenElResultado: true, mesesParaCerrar: [] })).toEqual([]);
  });
  it("lo de la venta es de RevOps, lo de la plata del CFO; lo que tiene lugar propio no se repite", () => {
    const a = armarAgenda({
      inconsistencias: [linea("VENTAS_SIN_COBRANZA"), linea("VENTA_SIN_MONTO"), linea("COMISIONES_VENCIDAS", "x", 54787), linea("ALGO_NUEVO")],
      aliadosDecidido: true,
      aliadosDecidenElResultado: null,
      mesesParaCerrar: [],
    });
    expect(a.map((p) => [p.clave, p.rol, p.monto])).toEqual([
      ["VENTA_SIN_MONTO", "RevOps", null],
      ["COMISIONES_VENCIDAS", "CFO", 54787],
      ["ALGO_NUEVO", "CFO", null],
    ]);
    expect(rolDeLinea("PIPELINE_SIN_DECIDIR")).toBe("CEO");
  });
});

describe("la planilla del piso contra la que se pagó", () => {
  const base = {
    anio: 2026, hoyISO: HOY, mesesParciales: [], facturadoTotal: 0,
    ventas: { vendido: 0, sinCobranza: { cuantas: 0, monto: 0 }, parcial: { cuantas: 0, monto: 0 }, sinCliente: { cuantas: 0, monto: 0, items: [] }, sinMonto: { cuantas: 0, items: [] }, resueltasPorNombre: { cuantas: 0, items: [] }, fueraDePipeline: { cuantas: 0, monto: 0, sinMonto: 0 }, descubiertas: [] },
    comisionesVencidas: [], serviciosSinCobros: { cuantas: 0, monto: 0, items: [] }, cuentasSinEmpresa: { cuantas: 0, items: [] },
    facturaSoloFueraDePipeline: { cuantas: 0, facturado: 0, cobrado: 0, items: [] }, facturaDeGrupo: { cuantas: 0, facturado: 0, items: [] },
    cobradosSinFecha: { cuantas: 0, total: 1 }, periodosSinTasa: [], facturadoSinTasa: [], monedaInferida: [], desviosDeCambio: [],
    tarjetaYHerramientas: { hay: false, periodos: [] }, aguinaldo: null, ingresosSinCategoria: { cuantas: 0, monto: 0, items: [] },
  };
  it("una diferencia de más del 10 % sale como pregunta del CFO, sin sumar al total", () => {
    const l = detectarInconsistencias({ ...base, planilla: { costoMensual: 29536, ultimoPagado: { periodo: "julio", monto: 17504 } } }).find(
      (x) => x.codigo === "PLANILLA_COSTO_VS_PAGADO",
    );
    expect(l?.titulo).toBe("¿Cuánto cuesta de verdad la planilla?");
    expect(l?.montoEnJuego).toBeNull();
    expect(rolDeLinea("PLANILLA_COSTO_VS_PAGADO")).toBe("CFO");
  });
  it("parecidas, o sin un mes con la planilla completa, no hay línea", () => {
    expect(detectarInconsistencias({ ...base, planilla: { costoMensual: 18000, ultimoPagado: { periodo: "julio", monto: 17504 } } })).toEqual([]);
    expect(detectarInconsistencias({ ...base, planilla: { costoMensual: 29536, ultimoPagado: null } })).toEqual([]);
  });
});
