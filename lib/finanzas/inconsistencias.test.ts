/**
 * lib/finanzas/inconsistencias.test.ts
 *
 * Lo que esta lista tiene que sostener no es aritmética: es que sirva de agenda. Un punto
 * sin monto no se puede priorizar, uno sin dueño no se resuelve, y uno que sigue
 * apareciendo después de arreglado hace que nadie vuelva a mirar la lista.
 */
import { describe, expect, it } from "vitest";
import { detectarInconsistencias, resumirInconsistencias, type EstadoParaAuditar } from "./inconsistencias";

/** Un estado LIMPIO: todo en cero. Cada caso enciende solo lo que quiere probar. */
const limpio = (): EstadoParaAuditar => ({
  anio: 2026,
  hoyISO: "2026-08-19",
  mesesParciales: [],
  facturadoTotal: 228_642.66,
  ventas: {
    vendido: 194_365.67,
    sinCobranza: { cuantas: 0, monto: 0 },
    parcial: { cuantas: 0, monto: 0 },
    sinCliente: { cuantas: 0, monto: 0 },
    sinMonto: { cuantas: 0, items: [] },
    resueltasPorNombre: { cuantas: 0, items: [] },
    fueraDePipeline: { cuantas: 0, monto: 0 },
    peoresDescubiertas: [],
  },
  comisionesVencidas: [],
  serviciosSinCobros: { cuantas: 0, monto: 0, items: [] },
  cuentasSinEmpresa: { cuantas: 0, items: [] },
  cobradosSinFecha: { cuantas: 0, total: 101 },
  periodosSinTasa: [],
  monedaInferida: [],
  desviosDeCambio: [],
  tarjetaYHerramientas: { hay: false, periodos: [] },
  aguinaldo: null,
});

describe("nada roto = lista vacía", () => {
  it("un sistema sin inconsistencias no inventa ninguna", () => {
    expect(detectarInconsistencias(limpio())).toEqual([]);
  });

  it("EL CASO QUE IMPORTA: lo que se arregla DESAPARECE de la lista", () => {
    // Es la propiedad que hace que alguien vuelva a mirarla. Con una lista escrita a
    // mano, lo resuelto sigue ahí y a la tercera vez nadie la abre.
    const con = { ...limpio(), serviciosSinCobros: { cuantas: 2, monto: 6840, items: ["ALFA+", "Alliance RH"] } };
    expect(detectarInconsistencias(con).some((x) => x.codigo === "SERVICIO_SIN_COBROS")).toBe(true);
    const arreglado = { ...con, serviciosSinCobros: { cuantas: 0, monto: 0, items: [] } };
    expect(detectarInconsistencias(arreglado).some((x) => x.codigo === "SERVICIO_SIN_COBROS")).toBe(false);
  });
});

describe("las ventas sin cobranza", () => {
  const conVentas = (): EstadoParaAuditar => ({
    ...limpio(),
    ventas: {
      ...limpio().ventas,
      sinCobranza: { cuantas: 16, monto: 61_805.67 },
      parcial: { cuantas: 12, monto: 46_738.36 },
      sinCliente: { cuantas: 7, monto: 28_880 },
      peoresDescubiertas: ["RC Inmobiliaria", "JUDESUR"],
    },
  });

  it("suma las tres situaciones en un solo monto", () => {
    const x = detectarInconsistencias(conVentas()).find((i) => i.codigo === "VENTAS_SIN_COBRANZA")!;
    expect(x.montoEnJuego).toBe(137_424.03);
    expect(x.severidad).toBe("ALTA");
  });

  it("las distingue en el texto: no son el mismo problema", () => {
    // "Sin nada cargado" se arregla dando de alta; "factura menos de lo que vendió" es
    // una conversación distinta. Fundirlas en un número esconde qué hay que hacer.
    const x = detectarInconsistencias(conVentas()).find((i) => i.codigo === "VENTAS_SIN_COBRANZA")!;
    expect(x.detalle).toContain("16 clientes sin nada cargado");
    expect(x.detalle).toContain("12 que facturan menos");
    expect(x.detalle).toContain("7 ventas de empresas que ni existen");
  });
});

describe("las comisiones vencidas", () => {
  it("solo entran las que YA vencieron: una futura no es una inconsistencia", () => {
    const e: EstadoParaAuditar = {
      ...limpio(),
      comisionesVencidas: [
        { partner: "HubSpot", monto: 51_000, fecha: "2026-08-14" }, // venció
        { partner: "HubSpot", monto: 51_000, fecha: "2026-11-14" }, // todavía no
      ],
    };
    const x = detectarInconsistencias(e).find((i) => i.codigo === "COMISIONES_VENCIDAS")!;
    expect(x.montoEnJuego).toBe(51_000);
    expect(x.items).toHaveLength(1);
  });

  it("sin ninguna vencida, el punto no aparece", () => {
    const e: EstadoParaAuditar = {
      ...limpio(),
      comisionesVencidas: [{ partner: "HubSpot", monto: 51_000, fecha: "2026-11-14" }],
    };
    expect(detectarInconsistencias(e).some((i) => i.codigo === "COMISIONES_VENCIDAS")).toBe(false);
  });
});

describe("severidad y prioridad", () => {
  it("los cobros sin fecha suben a ALTA cuando pasan del 15%", () => {
    const poco = { ...limpio(), cobradosSinFecha: { cuantas: 10, total: 101 } };
    const mucho = { ...limpio(), cobradosSinFecha: { cuantas: 50, total: 101 } };
    expect(detectarInconsistencias(poco).find((x) => x.codigo === "COBRADO_SIN_FECHA")!.severidad).toBe("MEDIA");
    expect(detectarInconsistencias(mucho).find((x) => x.codigo === "COBRADO_SIN_FECHA")!.severidad).toBe("ALTA");
  });

  it("la lista se ordena por la PLATA que mueve, no alfabéticamente", () => {
    const e: EstadoParaAuditar = {
      ...limpio(),
      serviciosSinCobros: { cuantas: 2, monto: 6840, items: [] },
      ventas: { ...limpio().ventas, sinCobranza: { cuantas: 16, monto: 61_805 } },
      aguinaldo: { segunNexus: 1306.47, segunExcel: 1602.77 },
    };
    const r = detectarInconsistencias(e);
    expect(r[0]!.codigo).toBe("VENTAS_SIN_COBRANZA"); // 61.805
    expect(r[1]!.codigo).toBe("SERVICIO_SIN_COBROS"); // 6.840
  });

  it("lo que no se puede cuantificar va DESPUÉS de lo que sí, ordenado por severidad", () => {
    const e: EstadoParaAuditar = {
      ...limpio(),
      serviciosSinCobros: { cuantas: 1, monto: 100, items: [] },
      monedaInferida: ["Alquiler"], // BAJA, sin monto
      periodosSinTasa: ["2026-09"], // ALTA, sin monto
    };
    const r = detectarInconsistencias(e);
    expect(r[0]!.codigo).toBe("SERVICIO_SIN_COBROS"); // el único con monto
    expect(r[1]!.codigo).toBe("SIN_TIPO_DE_CAMBIO"); // ALTA antes que BAJA
    expect(r[2]!.codigo).toBe("MONEDA_INFERIDA");
  });
});

describe("cada punto dice quién lo resuelve", () => {
  it("las decisiones de negocio quedan marcadas para DIRECCION", () => {
    const e: EstadoParaAuditar = {
      ...limpio(),
      aguinaldo: { segunNexus: 1306.47, segunExcel: 1602.77 },
      tarjetaYHerramientas: { hay: true, periodos: ["2026-05"] },
      ventas: { ...limpio().ventas, fueraDePipeline: { cuantas: 31, monto: 211_020 } },
    };
    const r = detectarInconsistencias(e);
    for (const c of ["AGUINALDO_CRITERIO", "TARJETA_SOLAPA_HERRAMIENTAS", "PIPELINE_SIN_DECIDIR"]) {
      expect(r.find((x) => x.codigo === c)!.resuelve).toBe("DIRECCION");
    }
  });

  it("lo que se arregla cargando un dato queda para COBRANZA", () => {
    const e = { ...limpio(), cuentasSinEmpresa: { cuantas: 6, items: ["IIA", "Corrugando"] } };
    expect(detectarInconsistencias(e).find((x) => x.codigo === "CUENTA_SIN_EMPRESA")!.resuelve).toBe("COBRANZA");
  });

  it("TODOS los puntos tienen título, qué hacer y dueño — ninguno queda mudo", () => {
    const e: EstadoParaAuditar = {
      ...limpio(),
      mesesParciales: [{ periodo: "2026-01", faltantes: ["costos fijos"] }],
      ventas: { ...limpio().ventas, sinCobranza: { cuantas: 1, monto: 100 }, sinMonto: { cuantas: 13, items: ["x"] }, resueltasPorNombre: { cuantas: 3, items: ["y"] }, fueraDePipeline: { cuantas: 31, monto: 211_020 }, sinCliente: { cuantas: 7, monto: 28_880 } },
      comisionesVencidas: [{ partner: "HubSpot", monto: 51_000, fecha: "2026-08-14" }],
      serviciosSinCobros: { cuantas: 2, monto: 6840, items: ["a"] },
      cuentasSinEmpresa: { cuantas: 6, items: ["b"] },
      cobradosSinFecha: { cuantas: 3, total: 101 },
      periodosSinTasa: ["2026-09"],
      monedaInferida: ["c"],
      desviosDeCambio: [{ concepto: "JUDESUR", segunNexus: 6120.83, segunHubspot: 6720.67 }],
      tarjetaYHerramientas: { hay: true, periodos: ["2026-05"] },
      aguinaldo: { segunNexus: 1306.47, segunExcel: 1602.77 },
    };
    const r = detectarInconsistencias(e);
    expect(r.length).toBeGreaterThanOrEqual(12);
    for (const x of r) {
      expect(x.titulo.length).toBeGreaterThan(10);
      expect(x.queHacer.length).toBeGreaterThan(20);
      expect(["SISTEMA", "COBRANZA", "DIRECCION"]).toContain(x.resuelve);
      expect(x.codigo).toMatch(/^[A-Z_]+$/);
    }
  });
});

describe("resumirInconsistencias", () => {
  it("cuenta lo que mueve plata y lo que decide dirección", () => {
    const e: EstadoParaAuditar = {
      ...limpio(),
      ventas: { ...limpio().ventas, sinCobranza: { cuantas: 16, monto: 61_805 }, fueraDePipeline: { cuantas: 31, monto: 211_020 } },
      aguinaldo: { segunNexus: 1306.47, segunExcel: 1602.77 },
    };
    const r = resumirInconsistencias(detectarInconsistencias(e));
    expect(r.cuantas).toBe(3);
    expect(r.paraDireccion).toBe(2); // pipeline + aguinaldo
    expect(r.porSeveridad.ALTA).toBe(1);
  });

  it("una lista vacía resume en ceros, no en NaN", () => {
    expect(resumirInconsistencias([])).toEqual({
      cuantas: 0,
      montoTotal: 0,
      porSeveridad: { ALTA: 0, MEDIA: 0, BAJA: 0 },
      paraDireccion: 0,
    });
  });
});
