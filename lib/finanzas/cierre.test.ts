/**
 * lib/finanzas/cierre.test.ts — el cierre del mes (rediseño de Finanzas, 2026-10-03, etapa «Cierre del mes»).
 *
 * Correr: `npx vitest run lib/finanzas --project unit`.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  cambioDespuesDelCierre,
  confirmadoPorPersona,
  esFaltanteDePlanilla,
  estadoEnElAnio,
  faltanParaCerrar,
  huellasPorMes,
  itemsDeCierre,
  mandaLaTasaConfirmada,
  mesParaCerrar,
  quincenasPorMes,
  type DatosDelMes,
  type FuentesDeLaHuella,
  type NumerosDelCierre,
} from "./cierre";
import { cargarCierre, guardarTipoCambio, reabrirMes } from "./cierre-server";

// Lo de servidor (cierre-server.ts) se prueba con la base y los cargadores simulados, sin Postgres. El tipo de cambio
// del año es el de verdad (tipo-cambio-server.ts) sobre la base simulada: la regla de qué tasa manda es la que se prueba.
const { db, cargarEgresosDelAnio, cargarRevision } = vi.hoisted(() => ({
  db: {
    cierreMes: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    gastoPuntual: { findMany: vi.fn() },
    pagoPlanilla: { findMany: vi.fn() },
    tipoCambioDia: { findMany: vi.fn() },
    tipoCambioMes: { findMany: vi.fn(), upsert: vi.fn() },
    teamMember: { findMany: vi.fn() },
  },
  cargarEgresosDelAnio: vi.fn(),
  cargarRevision: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/para-ti/avisos-server", () => ({ avisar: vi.fn() }));
vi.mock("@/lib/cobranza/queries", () => ({ cargarEgresosDelAnio, loadReporteAnual: vi.fn() }));
vi.mock("@/lib/cobranza/odoo/diferencias", () => ({ textoDeMontos: () => "" }));
vi.mock("./revision-server", () => ({ cargarRevision }));
vi.mock("./pendientes-server", () => ({ medirPendientes: vi.fn() }));
vi.mock("./vista-server", () => ({ nombreDeQuienRegistra: async () => "Dinia", nombreDeQuienSupervisa: async () => "Alex" }));

beforeEach(() => {
  for (const tabla of Object.values(db)) for (const fn of Object.values(tabla)) fn.mockReset();
  db.cierreMes.findMany.mockResolvedValue([]);
  db.gastoPuntual.findMany.mockResolvedValue([]);
  db.pagoPlanilla.findMany.mockResolvedValue([]);
  db.tipoCambioDia.findMany.mockResolvedValue([]);
  db.tipoCambioMes.findMany.mockResolvedValue([]);
  db.teamMember.findMany.mockResolvedValue([]);
  cargarEgresosDelAnio.mockResolvedValue({ egresos: [], filasEgreso: [], planillaAcc: new Map(), calidadDada: new Map() });
  cargarRevision.mockResolvedValue({ pagos: [], gastos: [], devueltos: [] });
});

const nombres = { registra: "Dinia", supervisa: "Alex" };
const completo: DatosDelMes = {
  periodo: "2026-07",
  quincenas: [1, 2],
  quincenasPagadas: [1, 2],
  gastosListos: false,
  gastosAnotados: 0,
  faltantesDelExcel: [],
  tipoCambio: { crcPorUsd: 500, fuente: "BCCR", confirmadoPor: "alex@smarteamcr.com" },
  porRevisar: 0,
  devueltos: 0,
};

describe("qué frena el cierre", () => {
  it("un mes con todo listo no tiene nada que lo frene", () => {
    expect(faltanParaCerrar(itemsDeCierre(completo, null, nombres))).toEqual([]);
  });

  it("frenan la planilla, los gastos, el tipo de cambio y la revisión", () => {
    const d: DatosDelMes = {
      ...completo,
      quincenas: [1],
      quincenasPagadas: [1],
      faltantesDelExcel: ["costos fijos"],
      tipoCambio: { crcPorUsd: 500, fuente: "Excel", confirmadoPor: null },
      porRevisar: 3,
    };
    const items = itemsDeCierre(d, null, nombres);
    expect(faltanParaCerrar(items).map((i) => i.clave)).toEqual(["planilla", "gastos", "tipo-cambio", "revision"]);
    expect(items.find((i) => i.clave === "planilla")?.detalle).toBe("Falta la 2.ª quincena de julio.");
  });

  it("desde octubre de 2026 los gastos los da por completos quien registra, no el Excel", () => {
    const octubre = { ...completo, periodo: "2026-10", faltantesDelExcel: ["costos fijos"] };
    const gastos = (d: DatosDelMes) => itemsDeCierre(d, null, nombres).find((i) => i.clave === "gastos")!;
    expect(gastos(octubre).listo).toBe(false);
    expect(gastos(octubre).quien).toBe("Dinia");
    expect(gastos({ ...octubre, gastosListos: true, gastosAnotados: 4 }).listo).toBe(true);
  });

  it("lo de Ingresos y Conciliación se muestra pero no frena", () => {
    const equipo = {
      porFacturar: { n: 15, plata: "US$24.181,66" },
      pagosDetectados: { n: 5, plata: "US$4.691" },
      comisionesVencidas: 3,
      conciliacion: 112,
    };
    const items = itemsDeCierre(completo, equipo, nombres);
    expect(items.filter((i) => !i.bloquea).map((i) => i.clave)).toEqual(["facturar", "pagos", "comisiones", "conciliacion"]);
    expect(faltanParaCerrar(items)).toEqual([]);
  });
});

describe("las piezas", () => {
  it("un tipo de cambio lo confirmó una persona si lo firma un email", () => {
    expect(confirmadoPorPersona("script:cargar-tipo-cambio")).toBeNull();
    expect(confirmadoPorPersona("alex@smarteamcr.com")).toBe("alex@smarteamcr.com");
    expect(confirmadoPorPersona(null)).toBeNull();
  });
  it("los faltantes de planilla ya tienen su línea", () => {
    expect(esFaltanteDePlanilla("planilla")).toBe(true);
    expect(esFaltanteDePlanilla("planilla-q2")).toBe(true);
    expect(esFaltanteDePlanilla("costos fijos")).toBe(false);
  });
  it("el mes que toca cerrar es el anterior, también en enero", () => {
    expect(mesParaCerrar("2026-10-04")).toBe("2026-09");
    expect(mesParaCerrar("2027-01-02")).toBe("2026-12");
  });
});

describe("la tira del año", () => {
  const hoy = "2026-10-04";
  it("cerrado, por venir, en curso, completo o lo que falta", () => {
    expect(estadoEnElAnio("2026-04", hoy, true, []).estado).toBe("CERRADO");
    expect(estadoEnElAnio("2026-11", hoy, false, []).texto).toBe("Por venir");
    expect(estadoEnElAnio("2026-10", hoy, false, [{ clave: "planilla" }]).texto).toBe("En curso");
    expect(estadoEnElAnio("2026-07", hoy, false, []).estado).toBe("LISTO");
    expect(estadoEnElAnio("2026-08", hoy, false, [{ clave: "planilla" }]).texto).toBe("Falta planilla");
    expect(estadoEnElAnio("2026-09", hoy, false, [{ clave: "planilla" }, { clave: "gastos" }]).texto).toBe("Faltan 2 cosas");
  });
});

describe("cambió después del cierre (decisión de Elías con Alex, 2026-10-06: cobrar no lo marca)", () => {
  /** Septiembre al cerrarlo el 5 de octubre: dos gastos, la planilla, la reserva de aguinaldo y dos facturas. */
  const fuentes: FuentesDeLaHuella = {
    egresos: [
      { periodo: "2026-09", rubro: "HERRAMIENTA", monto: 535, moneda: "USD" },
      { periodo: "2026-09", rubro: "FIJO_OPERACION", monto: 250000, moneda: "CRC" },
      { periodo: "2026-09", rubro: "PLANILLA", monto: 4400, moneda: "USD" },
      { periodo: "2026-09", rubro: "RESERVA_AGUINALDO", monto: 800, moneda: "USD" },
    ],
    facturas: [
      { fechaEmisionISO: "2026-09-03", monto: 3373, moneda: "USD" },
      { fechaEmisionISO: "2026-09-20", monto: 1500, moneda: "USD" },
      // Sin factura todavía (programado): no es una factura del mes.
      { fechaEmisionISO: null, monto: 940, moneda: "USD" },
    ],
    comisiones: [
      { fechaISO: "2026-09-30", monto: 1200, moneda: "USD", esProyeccion: false },
      { fechaISO: "2026-09-30", monto: 51000, moneda: "USD", esProyeccion: true },
    ],
  };
  const sep = (f: FuentesDeLaHuella) => huellasPorMes(f).get("2026-09");
  const cierre: NumerosDelCierre = { moneda: "USD", egresos: 0, facturado: 0, cobrado: 0, ingresosTotales: 0, huella: sep(fuentes) };

  it("la huella: gastos sin la reserva de aguinaldo y facturas por emisión, cada uno en su moneda", () => {
    expect(sep(fuentes)).toEqual({ gastos: { USD: 4935, CRC: 250000 }, facturas: { USD: 6073 } });
  });

  it("EL CASO DEL PEDIDO: el cliente paga el 10 de octubre una factura de septiembre y septiembre no se marca", () => {
    // Cobrarla no cambia su monto ni su fecha de emisión: la factura sigue siendo de septiembre.
    expect(cambioDespuesDelCierre(cierre, sep(fuentes))).toBe(false);
  });

  it("agregar, corregir o borrar un gasto, una factura o una quincena lo marca", () => {
    const gastoNuevo = { ...fuentes, egresos: [...fuentes.egresos, { periodo: "2026-09", rubro: "GASTO", monto: 80, moneda: "USD" }] };
    const quincenaCorregida = {
      ...fuentes,
      egresos: fuentes.egresos.map((e) => (e.rubro === "PLANILLA" ? { ...e, monto: 4650 } : e)),
    };
    const facturaBorrada = { ...fuentes, facturas: fuentes.facturas.slice(1) };
    expect(cambioDespuesDelCierre(cierre, sep(gastoNuevo))).toBe(true);
    expect(cambioDespuesDelCierre(cierre, sep(quincenaCorregida))).toBe(true);
    expect(cambioDespuesDelCierre(cierre, sep(facturaBorrada))).toBe(true);
  });

  it("una factura que pasa a tener fecha de emisión en septiembre lo marca: es una factura nueva del mes", () => {
    const emitida = { ...fuentes, facturas: fuentes.facturas.map((f) => (f.fechaEmisionISO ? f : { ...f, fechaEmisionISO: "2026-09-25" })) };
    expect(cambioDespuesDelCierre(cierre, sep(emitida))).toBe(true);
  });

  it("la reserva de aguinaldo y una comisión estimada no lo marcan: no son algo anotado en el mes", () => {
    const aumentoEnNoviembre = {
      ...fuentes,
      egresos: fuentes.egresos.map((e) => (e.rubro === "RESERVA_AGUINALDO" ? { ...e, monto: 850 } : e)),
    };
    const otraEstimacion = {
      ...fuentes,
      comisiones: fuentes.comisiones.map((c) => (c.esProyeccion ? { ...c, monto: 60000 } : c)),
    };
    expect(cambioDespuesDelCierre(cierre, sep(aumentoEnNoviembre))).toBe(false);
    expect(cambioDespuesDelCierre(cierre, sep(otraEstimacion))).toBe(false);
  });

  it("un centavo de redondeo no cuenta; dos sí", () => {
    const h = sep(fuentes)!;
    expect(cambioDespuesDelCierre(cierre, { ...h, gastos: { ...h.gastos, USD: 4935.01 } })).toBe(false);
    expect(cambioDespuesDelCierre(cierre, { ...h, gastos: { ...h.gastos, USD: 4935.02 } })).toBe(true);
  });

  it("si se borra todo lo del mes, cambió; un cierre sin huella no se puede saber", () => {
    expect(cambioDespuesDelCierre(cierre, undefined)).toBe(true);
    expect(cambioDespuesDelCierre({ ...cierre, huella: undefined }, sep(fuentes))).toBeNull();
  });
});

// ── Decisiones de Elías del 2026-10-05 ──────────────────────────────────────────────────────────────────────────────

describe("D3 · la planilla tiene que estar PAGADA, no solo generada", () => {
  const planilla = (d: Partial<DatosDelMes>) => itemsDeCierre({ ...completo, ...d }, null, nombres).find((i) => i.clave === "planilla")!;

  it("con las dos quincenas pagadas está lista", () => {
    expect(planilla({}).listo).toBe(true);
    expect(planilla({}).detalle).toBe("Las dos quincenas están pagadas.");
  });

  it("generada pero sin marcar como pagada, frena el cierre y lo dice", () => {
    expect(planilla({ quincenasPagadas: [1] }).listo).toBe(false);
    expect(planilla({ quincenasPagadas: [1] }).detalle).toBe("Falta marcar como pagada la 2.ª quincena.");
    expect(planilla({ quincenasPagadas: [] }).detalle).toBe("Falta marcar como pagadas las dos quincenas.");
    expect(faltanParaCerrar(itemsDeCierre({ ...completo, quincenasPagadas: [2] }, null, nombres)).map((i) => i.clave)).toEqual(["planilla"]);
  });

  it("una sin generar y la otra sin pagar: dice las dos cosas", () => {
    expect(planilla({ quincenas: [2], quincenasPagadas: [] }).detalle).toBe("Falta la 1.ª quincena de julio, y marcar como pagada la 2.ª.");
    expect(planilla({ quincenas: [], quincenasPagadas: [] }).detalle).toBe("Falta toda la planilla de julio.");
  });

  it("una quincena con alguien todavía en PENDIENTE no está pagada", () => {
    const q = quincenasPorMes([
      { periodo: "2026-09", quincena: 1, estado: "PAGADO" },
      { periodo: "2026-09", quincena: 1, estado: "PAGADO" },
      { periodo: "2026-09", quincena: 2, estado: "PAGADO" },
      { periodo: "2026-09", quincena: 2, estado: "PENDIENTE" },
      { periodo: "2026-08", quincena: 2, estado: "PAGADO" },
      { periodo: "2026-08", quincena: 1, estado: "PAGADO" },
    ]);
    expect(q.get("2026-09")).toEqual({ anotadas: [1, 2], pagadas: [1] });
    expect(q.get("2026-08")).toEqual({ anotadas: [1, 2], pagadas: [1, 2] });
  });

  it("el cierre lee el estado de cada fila del libro: una quincena con un PENDIENTE no deja cerrar", async () => {
    db.pagoPlanilla.findMany.mockResolvedValue([
      { periodo: "2026-09", quincena: 1, estado: "PAGADO" },
      { periodo: "2026-09", quincena: 2, estado: "PAGADO" },
      { periodo: "2026-09", quincena: 2, estado: "PENDIENTE" },
    ]);
    const c = await cargarCierre("2026-09", "2026-10-05");
    const linea = c.items.find((i) => i.clave === "planilla")!;
    expect(linea.listo).toBe(false);
    expect(linea.detalle).toBe("Falta marcar como pagada la 2.ª quincena.");
  });
});

describe("D2 · si al BCCR le faltan días, se cierra confirmando la tasa", () => {
  const tipoCambio = (tc: DatosDelMes["tipoCambio"]) => itemsDeCierre({ ...completo, tipoCambio: tc }, null, nombres).find((i) => i.clave === "tipo-cambio")!;

  it("con el BCCR completo está lista, sin confirmar nada (como siempre)", () => {
    expect(tipoCambio({ crcPorUsd: 470, fuente: "BCCR", confirmadoPor: null, bccr: { dias: 30, completo: true } }).listo).toBe(true);
  });

  it("con días que faltan, la confirmada por una persona la deja lista; sin confirmar, ofrece confirmar", () => {
    const sin = tipoCambio({ crcPorUsd: 470, fuente: "BCCR", confirmadoPor: null, bccr: { dias: 11, completo: false } });
    expect(sin.listo).toBe(false);
    expect(sin.accion).toBe("Confirmar");
    expect(sin.href).toBe("#tipo-de-cambio");
    const con = tipoCambio({ crcPorUsd: 470, fuente: "BCCR", confirmadoPor: "alex@smarteamcr.com", bccr: { dias: 11, completo: false } });
    expect(con.listo).toBe(true);
  });

  it("la regla: manda la confirmada solo si al BCCR le faltan días de un mes que ya empezó, y la firmó una persona", () => {
    expect(mandaLaTasaConfirmada({ completo: false, porVenir: false }, "alex@smarteamcr.com")).toBe(true);
    expect(mandaLaTasaConfirmada({ completo: false, porVenir: false }, "script:cargar-tipo-cambio")).toBe(false);
    expect(mandaLaTasaConfirmada({ completo: true, porVenir: false }, "alex@smarteamcr.com")).toBe(false);
    expect(mandaLaTasaConfirmada({ completo: false, porVenir: true }, "alex@smarteamcr.com")).toBe(false);
    expect(mandaLaTasaConfirmada(null, "alex@smarteamcr.com")).toBe(false);
  });

  // Septiembre con solo sus últimos 11 días en el BCCR: le faltan días.
  const diasDeSeptiembre = Array.from({ length: 11 }, (_, i) => ({ fecha: `2026-09-${String(20 + i).padStart(2, "0")}`, venta: 470 }));

  it("confirmar firma la tasa que el mes está usando (el promedio de los días que hay) a nombre de quien confirma", async () => {
    db.tipoCambioDia.findMany.mockResolvedValue(diasDeSeptiembre);
    await guardarTipoCambio("2026-09", "alex@smarteamcr.com", null, "2026-10-05");
    expect(db.tipoCambioMes.upsert).toHaveBeenCalledTimes(1);
    const arg = db.tipoCambioMes.upsert.mock.calls[0]![0] as { update: { crcPorUsd: number; registradoPor: string } };
    expect(arg.update.crcPorUsd).toBe(470);
    expect(arg.update.registradoPor).toBe("alex@smarteamcr.com");
  });

  it("con el BCCR completo no hay nada que confirmar: 409", async () => {
    db.tipoCambioDia.findMany.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({ fecha: `2026-09-${String(i + 1).padStart(2, "0")}`, venta: 470 })),
    );
    await expect(guardarTipoCambio("2026-09", "alex@smarteamcr.com", null, "2026-10-05")).rejects.toMatchObject({ status: 409 });
    expect(db.tipoCambioMes.upsert).not.toHaveBeenCalled();
  });

  it("el cierre da la línea por lista con la tasa que confirmó una persona, y no con la que cargó un script", async () => {
    db.tipoCambioDia.findMany.mockResolvedValue(diasDeSeptiembre);
    const manual = (registradoPor: string) => [
      { periodo: "2026-09", crcPorUsd: 480, fuente: "a mano", registradoPor, registradoEn: new Date("2026-10-05T15:00:00Z") },
    ];
    db.tipoCambioMes.findMany.mockResolvedValue(manual("alex@smarteamcr.com"));
    const firmado = await cargarCierre("2026-09", "2026-10-05");
    expect(firmado.items.find((i) => i.clave === "tipo-cambio")!.listo).toBe(true);
    expect(firmado.tipoCambio?.crcPorUsd, "la confirmada es la que se usa").toBe(480);

    db.tipoCambioMes.findMany.mockResolvedValue(manual("script:cargar-tipo-cambio"));
    const deScript = await cargarCierre("2026-09", "2026-10-05");
    expect(deScript.items.find((i) => i.clave === "tipo-cambio")!.listo).toBe(false);
    expect(deScript.tipoCambio?.crcPorUsd, "sin persona manda el BCCR, aunque le falten días").toBe(470);
  });
});

describe("D5 · reabrir un mes pide de nuevo el aviso de que los gastos están todos", () => {
  it("reabrir borra quién avisó y cuándo", async () => {
    db.cierreMes.findUnique.mockResolvedValue({ estado: "CERRADO" });
    await reabrirMes("2026-09", "apareció una factura", "alex@smarteamcr.com");
    const arg = db.cierreMes.update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.estado).toBe("ABIERTO");
    expect(arg.data, "el aviso de antes quedó en pie después de reabrir").toMatchObject({ gastosListosPor: null, gastosListosEn: null });
  });
});
