/**
 * lib/finanzas/excel-vs-odoo.test.ts
 *
 * Correr: `npx vitest run lib/finanzas/excel-vs-odoo.test.ts --project unit`.
 *
 * Los casos son del Excel real de Alex («Asientos Contables Mercury Bank & Odoo Oficial.xlsx») y de la copia de
 * Odoo, medidos el 2026-09-13 en solo lectura: Global Supply FAC/2026/0206 y sus notas de crédito, las tres
 * facturas de McCann en colones, Publimark, Alta Las Palomas, AMVAC, IIA y Transportes Juanva. Donde el Excel
 * real no traía un caso (monto o moneda distintos, un pago parcial), se toma una de esas facturas y se le cambia
 * lo justo.
 */
import { describe, expect, it } from "vitest";
import type { FilaLibro } from "@/lib/cobranza/libro-alex-lectura";
import { filaDelLibro } from "@/lib/cobranza/__fixtures__/libro-alex";
import { resumirInconsistencias, type Inconsistencia } from "./inconsistencias";
import {
  anioDelExcel,
  avisosDeFrescura,
  compararExcelConOdoo,
  diasEntre,
  notaAlPie,
  type EntradaExcelVsOdoo,
  type ExcelVsOdoo,
  type FacturaDelEspejo,
} from "./excel-vs-odoo";

/* ── Armado ─────────────────────────────────────────────────────────────────────── */

const ODOO = "Asiento Contable por Mes ODOO";
const MERCURY = "Asientos Contables Mercury Bank";
const QBS = "Asiento contable de Recaudo QBs";
const COMPENDIO = "Compendio de Facturación Genera";

const GLOBAL = "GLOBAL SUPPLY SOCIEDAD ANONIMA";
/* El Excel copia la razón social con paréntesis; Odoo la guarda sin ellos. */
const MCCANN_EXCEL = "MCCANN ERICKSON CENTROAMERICANA (COSTA RICA) SOCIEDAD ANONIMA";
const MCCANN_ODOO = "MCCANN ERICKSON CENTROAMERICANA COSTA RICA SOCIEDAD ANONIMA";
const PUBLIMARK = "PUBLIMARK SOCIEDAD ANONIMA";
const PALOMAS = "ALTA LAS PALOMAS A.L.P SOCIEDAD DE RESPONSABILIDAD LIMITADA";
const AMVAC = "AMVAC DE COSTA RICA SOCIEDAD DE RESPONSABILIDAD LIMITADA";
const IIA = "ILEANA AGUILAR INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA";
const ACCCSA = "ACCCSA REVISTA & PUBLICACIONES SOCIEDAD ANONIMA";
const JUANVA = "TRANSPORTES JUANVA SOCIEDAD ANONIMA";

function factura(
  f: Pick<FacturaDelEspejo, "numero" | "odooPartnerId" | "odooPartnerNombre" | "montoTotal" | "invoiceDate"> & Partial<FacturaDelEspejo>,
): FacturaDelEspejo {
  return { moveType: "out_invoice", state: "posted", paymentState: "not_paid", moneda: "USD", montoResidual: f.montoTotal, estadoEspejo: "VIGENTE", ...f };
}

const excel: FilaLibro[] = [
  /* ⛔ Su «Importe pendiente firmado» es 1.050.044,86 COLONES con la fila en USD. La lectura lo deja en null;
     acá se pone a propósito, para probar que el cruce no lo lee nunca. */
  filaDelLibro({ hoja: ODOO, fila: 14, seccion: "ODOO", numero: "FAC/2026/0206", cliente: GLOBAL, total: 2109.71, pendiente: 1050044.86, estado: "SIN_PAGAR", periodo: "2026-02", fechaFactura: "2026-02-04", color: "VENCIDA" }),
  ...["0343", "0344", "0345"].map((n, i) =>
    filaDelLibro({ hoja: ODOO, fila: 120 + i, seccion: "ODOO", numero: `FAC/2026/${n}`, cliente: MCCANN_EXCEL, total: 13041612.44, moneda: "CRC", estado: "SIN_PAGAR", periodo: "2026-09", fechaFactura: "2026-09-10" }),
  ),
  filaDelLibro({ hoja: ODOO, fila: 16, seccion: "ODOO", numero: "FAC/2026/0209", cliente: PUBLIMARK, total: 15226.75, estado: "PAGADO", periodo: "2026-02", fechaFactura: "2026-02-12" }),
  filaDelLibro({ hoja: ODOO, fila: 17, seccion: "ODOO", numero: "FAC/2026/0210", cliente: PUBLIMARK, total: 15226.75, estado: "PAGADO", periodo: "2026-02", fechaFactura: "2026-02-12" }),
  filaDelLibro({ hoja: ODOO, fila: 30, seccion: "ODOO", numero: "FAC/2026/0225", cliente: PALOMAS, total: 621.5, estado: "SIN_PAGAR", periodo: "2026-03", fechaFactura: "2026-03-06" }),
  filaDelLibro({ hoja: ODOO, fila: 60, seccion: "ODOO", numero: "FAC/2026/0274", cliente: IIA, total: 135.6, estado: "PAGADO", periodo: "2026-04", fechaFactura: "2026-04-06" }),
  /* La misma factura en «Hoja 9», pintada de otro color: es UN documento, y el color no decide nada. */
  filaDelLibro({ hoja: "Hoja 9", fila: 4, seccion: "ODOO", numero: "FAC/2026/0274", cliente: IIA, total: 135.6, estado: "PAGADO", periodo: "2026-04", fechaFactura: "2026-04-06", color: "EN_GRACIA" }),
  filaDelLibro({ hoja: ODOO, fila: 11, seccion: "ODOO", numero: "FAC/2026/0204", cliente: ACCCSA, total: 2373, estado: "PAGADO", periodo: "2026-02", fechaFactura: "2026-02-02", color: "VENCIDA" }),
  /* Solo en el Compendio, sin estado ni mes: lo pagado lo dice su pendiente (0). */
  filaDelLibro({ hoja: COMPENDIO, fila: 80, seccion: "COMPENDIO", numero: "FAC/2026/0300", cliente: AMVAC, total: 2088.24, pendiente: 0, origen: "Odoo - Principal" }),
  /* Lo que no pasa por Odoo. INV-26 es el fondo de marketing de Insider: no es cartera. */
  filaDelLibro({ hoja: MERCURY, fila: 12, seccion: "MERCURY", numero: "INV-11", cliente: "Atom Chat INC", total: 2796.75, estado: "PAGADO", periodo: "2026-02" }),
  filaDelLibro({ hoja: MERCURY, fila: 41, seccion: "MERCURY", numero: "INV-26", cliente: "INSIDER DIGITAL SOCIEDAD ANONIMA DE CAPITAL VARIABLE / IDI220418NB4", total: 5226, estado: "PAGADO", periodo: "2026-06" }),
  filaDelLibro({ hoja: QBS, fila: 3, seccion: "QUICKBOOKS", cliente: "Sfera Legal", total: 3800, pendiente: 3800 }),
  filaDelLibro({ hoja: QBS, fila: 10, seccion: "NO_INSCRITOS", cliente: "Bluesat", proyecto: "Welcome Kit + SignNow", total: 5700, pendiente: 3800 }),
];

const espejo: FacturaDelEspejo[] = [
  factura({ numero: "FAC/2026/0206", odooPartnerId: 2, odooPartnerNombre: GLOBAL, montoTotal: 2109.71, invoiceDate: "2026-02-04" }),
  factura({ numero: "FAC/2026/0199", odooPartnerId: 2, odooPartnerNombre: GLOBAL, montoTotal: 2109.71, invoiceDate: "2026-01-16", estadoEspejo: "DESAPARECIDA" }),
  factura({ numero: "FAC/2026/0228", odooPartnerId: 2, odooPartnerNombre: GLOBAL, montoTotal: 2109.71, invoiceDate: "2026-03-06", paymentState: "reversed" }),
  factura({ numero: "FAC/2025/0180", odooPartnerId: 2, odooPartnerNombre: GLOBAL, montoTotal: 2109.71, invoiceDate: "2025-12-04", paymentState: "paid" }),
  factura({ numero: "FAC/2025/0249", moveType: "out_refund", odooPartnerId: 2, odooPartnerNombre: GLOBAL, montoTotal: 2109.71, invoiceDate: "2025-12-05" }),
  factura({ numero: "FAC/2026/0248", moveType: "out_refund", odooPartnerId: 2, odooPartnerNombre: GLOBAL, montoTotal: 2109.71, invoiceDate: "2026-03-06" }),
  factura({ numero: "NC/2026/0017", moveType: "out_refund", paymentState: "paid", odooPartnerId: 2, odooPartnerNombre: GLOBAL, montoTotal: 2109.71, invoiceDate: "2026-09-09" }),
  ...["0343", "0344", "0345"].map((n) =>
    factura({ numero: `FAC/2026/${n}`, odooPartnerId: 168, odooPartnerNombre: MCCANN_ODOO, moneda: "CRC", montoTotal: 13041612.44, invoiceDate: "2026-09-10" }),
  ),
  factura({ numero: "FAC/2026/0209", paymentState: "paid", odooPartnerId: 75, odooPartnerNombre: PUBLIMARK, montoTotal: 15226.75, invoiceDate: "2026-02-12" }),
  factura({ numero: "FAC/2026/0210", odooPartnerId: 75, odooPartnerNombre: PUBLIMARK, montoTotal: 15226.75, invoiceDate: "2026-02-12" }),
  factura({ numero: "FAC/2026/0232", paymentState: "reversed", odooPartnerId: 75, odooPartnerNombre: PUBLIMARK, montoTotal: 13041612.5, invoiceDate: "2026-03-24" }),
  factura({ numero: "FAC/2026/0246", moveType: "out_refund", odooPartnerId: 75, odooPartnerNombre: PUBLIMARK, montoTotal: 15226.75, invoiceDate: "2026-02-12" }),
  factura({ numero: "FAC/2026/0225", paymentState: "reversed", odooPartnerId: 30, odooPartnerNombre: PALOMAS, montoTotal: 621.5, invoiceDate: "2026-03-06" }),
  factura({ numero: "FAC/2026/0274", paymentState: "in_payment", odooPartnerId: 1, odooPartnerNombre: IIA, montoTotal: 135.6, invoiceDate: "2026-04-06" }),
  factura({ numero: "FAC/2026/0204", paymentState: "paid", odooPartnerId: 40, odooPartnerNombre: ACCCSA, montoTotal: 2373, invoiceDate: "2026-02-02" }),
  factura({ numero: "NC/2026/0003", moveType: "out_refund", state: "cancel", odooPartnerId: 40, odooPartnerNombre: ACCCSA, montoTotal: 2373, invoiceDate: "2026-04-17" }),
  factura({ numero: "FAC/2026/0300", paymentState: "reversed", odooPartnerId: 5, odooPartnerNombre: AMVAC, montoTotal: 2088.24, invoiceDate: "2026-06-15" }),
  factura({ numero: "FAC/2026/0197", odooPartnerId: 50, odooPartnerNombre: JUANVA, montoTotal: 500, invoiceDate: "2026-01-20" }),
  /* Cliente que no está en el Excel: su nota sin aplicar no es de esta página. */
  factura({ numero: "FAC/2025/0247", moveType: "out_refund", odooPartnerId: 60, odooPartnerNombre: "STCR COSTA RICA TRUST AND ESCROW COMPANY LIMITED SOCIEDAD ANONIMA", montoTotal: 2109.33, invoiceDate: "2025-10-08" }),
];

const entrada = (cambios: Partial<EntradaExcelVsOdoo> = {}): EntradaExcelVsOdoo => ({
  filas: excel,
  facturas: espejo,
  excelDelDia: "2026-09-12",
  odooDelDia: "2026-09-13",
  anio: 2026,
  ...cambios,
});

/** El espejo con una factura cambiada. */
const conFactura = (numero: string, cambios: Partial<FacturaDelEspejo>) =>
  espejo.map((f) => (f.numero === numero ? { ...f, ...cambios } : f));
/** El Excel con una fila cambiada (la de la pestaña de Odoo). */
const conFila = (numero: string, cambios: Partial<FilaLibro>) =>
  excel.map((f) => (f.numero === numero && f.hoja !== "Hoja 9" ? { ...f, ...cambios } : f));

const linea = (r: ExcelVsOdoo, codigo: string): Inconsistencia => {
  const x = r.inconsistencias.find((i) => i.codigo === codigo);
  if (!x) throw new Error(`No está la línea ${codigo}: ${r.inconsistencias.map((i) => i.codigo).join(", ")}`);
  return x;
};
const numeros = (x: Inconsistencia) => x.items.map((it) => it.id);
const codigos = (r: ExcelVsOdoo) => r.inconsistencias.map((i) => i.codigo);

const base = compararExcelConOdoo(entrada());

/* ── Lo que se compara ──────────────────────────────────────────────────────────── */

describe("qué entra a la comparación", () => {
  it("solo las facturas de Odoo del Excel, una vez cada una aunque esté en dos pestañas", () => {
    // 0206, las 3 de McCann, 0209, 0210, 0225, 0274 (dos pestañas), 0204 y 0300 (solo en el Compendio).
    expect(base.comparados).toBe(10);
    expect(numeros(linea(base, "PAGADA_SIN_CONCILIAR-USD"))).toEqual(["FAC/2026/0274"]);
  });

  it("lo que no pasa por Odoo va en la nota al pie, contado, y el fondo de Insider no cuenta en ningún lado", () => {
    expect(base.noComparado.fueraDeOdoo).toEqual([
      { seccion: "MERCURY", cuantos: 1 },
      { seccion: "QUICKBOOKS", cuantos: 1 },
      { seccion: "NO_INSCRITOS", cuantos: 1 },
    ]);
    expect(notaAlPie(base.noComparado)).toBe(
      "No se comparan 3 documentos del Excel que no pasan por Odoo (1 de Mercury, 1 de QuickBooks y 1 de No inscritos): Odoo no tiene contra qué mirarlos.",
    );
    expect(JSON.stringify(base.inconsistencias)).not.toMatch(/INV-/);
  });

  it("lo que coincide no aparece: Global Supply 0206 sin pagar en los dos, Publimark 0209 pagada en los dos, ACCCSA pintada de amarillo pero pagada", () => {
    const listados = base.inconsistencias.flatMap(numeros);
    for (const n of ["FAC/2026/0206", "FAC/2026/0209", "FAC/2026/0204", "FAC/2026/0343", "FAC/2026/0344", "FAC/2026/0345"]) {
      expect(listados).not.toContain(n);
    }
  });
});

/* ── Las siete categorías ───────────────────────────────────────────────────────── */

describe("1 · el Excel dice pagada y Odoo no", () => {
  it("Publimark 0210: pagada en el Excel, sin pago en Odoo; el monto es lo que Odoo deja por cobrar", () => {
    const x = linea(base, "EXCEL_PAGADA_ODOO_NO-USD");
    expect(numeros(x)).toEqual(["FAC/2026/0210"]);
    expect(x).toMatchObject({ montoEnJuego: 15226.75, moneda: "USD", resuelve: "COBRANZA", severidad: "ALTA" });
    expect(x.items[0]?.nota).toBe(
      "Odoo: sin pago · Odoo tiene sin aplicar la nota de crédito FAC/2026/0246 del mismo cliente por el mismo monto: si anuló esta factura, falta aplicarla · febrero de 2026",
    );
  });

  it("⚠ Publimark 0210 y su nota de crédito 0246, del mismo día y monto y sin aplicar: la factura nombra la nota y la nota nombra la factura", () => {
    // Medido en la copia real: sin esto, «si no está el depósito, marcarla sin pagar» devolvía al Excel
    // US$15.226,75 de una factura que Odoo anuló y nadie cruzó.
    const nota = linea(base, "NOTA_DE_CREDITO_SIN_APLICAR-USD").items.find((it) => it.id === "FAC/2026/0246")?.nota;
    expect(nota).toBe("Emitida en febrero de 2026 · mismo cliente y monto que FAC/2026/0210, que el Excel da pagada y Odoo sin pago");
    expect(linea(base, "EXCEL_PAGADA_ODOO_NO-USD").queHacer).toMatch(/nota de crédito sin aplicar/);
  });

  it("no nombra una nota ya aplicada, de otro cliente o por otro monto", () => {
    const notaDe0210 = (facturas: FacturaDelEspejo[]) =>
      linea(compararExcelConOdoo(entrada({ facturas })), "EXCEL_PAGADA_ODOO_NO-USD").items.find((it) => it.id === "FAC/2026/0210")?.nota;
    expect(notaDe0210(conFactura("FAC/2026/0246", { paymentState: "paid" }))).toBe("Odoo: sin pago · febrero de 2026");
    expect(notaDe0210(conFactura("FAC/2026/0246", { odooPartnerId: 2 }))).toBe("Odoo: sin pago · febrero de 2026");
    expect(notaDe0210(conFactura("FAC/2026/0246", { montoTotal: 15226.7 }))).toBe("Odoo: sin pago · febrero de 2026");
    // Y la nota de Global Supply no nombra a 0206: el Excel la da sin pagar, no hay nada que explicar.
    expect(linea(base, "NOTA_DE_CREDITO_SIN_APLICAR-USD").items.find((it) => it.id === "FAC/2026/0248")?.nota).toBe("Emitida en marzo de 2026");
  });

  it("con un pago parcial, el monto es lo que falta y no el total", () => {
    const r = compararExcelConOdoo(entrada({ facturas: conFactura("FAC/2026/0210", { paymentState: "partial", montoResidual: 7613.38 }) }));
    const x = linea(r, "EXCEL_PAGADA_ODOO_NO-USD");
    expect(x.montoEnJuego).toBe(7613.38);
    expect(x.items[0]?.nota).toBe("Odoo: pago parcial, faltan US$7.613,38 de US$15.226,75 · febrero de 2026");
  });

  it("⚠ registrada sin conciliar NO es sin pagar: IIA 0274 va en su propia línea, de prioridad baja", () => {
    expect(numeros(linea(base, "EXCEL_PAGADA_ODOO_NO-USD"))).not.toContain("FAC/2026/0274");
    expect(linea(base, "PAGADA_SIN_CONCILIAR-USD")).toMatchObject({ severidad: "BAJA", montoEnJuego: 135.6 });
  });
});

describe("2 · el Excel dice sin pagar y Odoo pagada", () => {
  it("Global Supply 0206 pagada en Odoo: el monto es la deuda que el Excel sigue contando", () => {
    const r = compararExcelConOdoo(entrada({ facturas: conFactura("FAC/2026/0206", { paymentState: "paid" }) }));
    const x = linea(r, "EXCEL_SIN_PAGAR_ODOO_PAGADA-USD");
    expect(numeros(x)).toEqual(["FAC/2026/0206"]);
    expect(x.montoEnJuego).toBe(2109.71);
    expect(x.items[0]?.nota).toBe("Odoo: pagada y conciliada con el banco · el Excel la da sin pagar · febrero de 2026");
  });

  it("también con el pago registrado sin conciliar, y entonces lo dice", () => {
    const r = compararExcelConOdoo(entrada({ facturas: conFactura("FAC/2026/0206", { paymentState: "in_payment" }) }));
    expect(linea(r, "EXCEL_SIN_PAGAR_ODOO_PAGADA-USD").items[0]?.nota).toMatch(/pago registrado, sin conciliar/);
    expect(numeros(linea(r, "PAGADA_SIN_CONCILIAR-USD"))).toEqual(["FAC/2026/0274"]);
  });

  it("⚠ lo decide la columna de estado, no el color: una fila verde («en gracia») sin pagar sigue siendo sin pagar", () => {
    const r = compararExcelConOdoo(
      entrada({ filas: conFila("FAC/2026/0206", { color: "EN_GRACIA" }), facturas: conFactura("FAC/2026/0206", { paymentState: "paid" }) }),
    );
    expect(numeros(linea(r, "EXCEL_SIN_PAGAR_ODOO_PAGADA-USD"))).toEqual(["FAC/2026/0206"]);
  });
});

describe("3 · está en el Excel y Odoo no la tiene vigente", () => {
  it("revertidas: Alta Las Palomas (sin pagar en el Excel) y AMVAC, que solo está en el Compendio y no trae mes", () => {
    const x = linea(base, "EXCEL_NO_VIGENTE_EN_ODOO-USD");
    expect(numeros(x)).toEqual(["FAC/2026/0300", "FAC/2026/0225"]);
    expect(x.montoEnJuego).toBe(2709.74);
    expect(x.items.map((it) => it.nota)).toEqual([
      "Odoo la revirtió con una nota de crédito · el Excel la da pagada",
      "Odoo la revirtió con una nota de crédito · el Excel la da sin pagar · marzo de 2026",
    ]);
  });

  it("desaparecida, anulada, sin ese número, y posterior a la copia de Odoo: cada una con su motivo", () => {
    const filas = [
      ...excel,
      filaDelLibro({ hoja: ODOO, fila: 9, seccion: "ODOO", numero: "FAC/2026/0199", cliente: GLOBAL, total: 2109.71, estado: "SIN_PAGAR", periodo: "2026-01" }),
      filaDelLibro({ hoja: ODOO, fila: 70, seccion: "ODOO", numero: "FAC/2026/0290", cliente: GLOBAL, total: 100, estado: "SIN_PAGAR", periodo: "2026-06", fechaFactura: "2026-06-01" }),
      filaDelLibro({ hoja: ODOO, fila: 130, seccion: "ODOO", numero: "FAC/2026/0350", cliente: GLOBAL, total: 50, estado: "SIN_PAGAR", periodo: "2026-09", fechaFactura: "2026-09-14" }),
    ];
    const r = compararExcelConOdoo(entrada({ filas, facturas: conFactura("FAC/2026/0225", { paymentState: "not_paid", state: "cancel" }) }));
    const nota = (n: string) => linea(r, "EXCEL_NO_VIGENTE_EN_ODOO-USD").items.find((it) => it.id === n)?.nota;
    expect(nota("FAC/2026/0199")).toMatch(/^Odoo la tenía y ya no la devuelve/);
    expect(nota("FAC/2026/0225")).toMatch(/^Odoo la tiene anulada/);
    expect(nota("FAC/2026/0290")).toMatch(/^Odoo no tiene ese número ·/);
    expect(nota("FAC/2026/0350")).toMatch(/posterior a la última copia de Odoo/);
  });
});

describe("4 · Odoo tiene facturas del año que el Excel no lista", () => {
  it("Transportes Juanva 0197; no las revertidas (Publimark 0232, Global 0228), ni las desaparecidas, ni las de 2025", () => {
    const x = linea(base, "ODOO_FALTA_EN_EXCEL-USD");
    expect(numeros(x)).toEqual(["FAC/2026/0197"]);
    expect(x.titulo).toBe("Una factura de 2026 que Odoo tiene y el Excel no lista");
    expect(x.items[0]?.nota).toBe("Odoo: sin pago · enero de 2026");
  });

  it("la que Odoo emitió después de subir el Excel no falta: se cuenta en la nota al pie", () => {
    const facturas = [...espejo, factura({ numero: "FAC/2026/0346", odooPartnerId: 2, odooPartnerNombre: GLOBAL, montoTotal: 3837.48, invoiceDate: "2026-09-13" })];
    const r = compararExcelConOdoo(entrada({ facturas }));
    expect(numeros(linea(r, "ODOO_FALTA_EN_EXCEL-USD"))).toEqual(["FAC/2026/0197"]);
    expect(r.noComparado.posterioresAlExcel).toBe(1);
    expect(notaAlPie(r.noComparado)).toMatch(/Tampoco una factura que Odoo emitió después de que se subió el Excel/);
  });

  it("una factura anotada solo en el Compendio no falta", () => {
    const filas = [...excel, filaDelLibro({ hoja: COMPENDIO, fila: 91, seccion: "COMPENDIO", numero: "FAC/2026/0197", cliente: JUANVA, total: 500, pendiente: 500, origen: "Odoo - Principal" })];
    expect(codigos(compararExcelConOdoo(entrada({ filas })))).not.toContain("ODOO_FALTA_EN_EXCEL-USD");
  });
});

describe("5 · monto distinto, con tolerancia de un céntimo", () => {
  it("Publimark 0209 anotada en 15.226,00: la diferencia son 75 céntimos", () => {
    const r = compararExcelConOdoo(entrada({ filas: conFila("FAC/2026/0209", { total: 15226 }) }));
    const x = linea(r, "MONTO_DISTINTO-USD");
    expect(x.montoEnJuego).toBe(0.75);
    expect(x.items[0]?.nota).toBe("El Excel: US$15.226 · Odoo: US$15.226,75 · febrero de 2026");
  });

  it("un céntimo no es diferencia; dos sí", () => {
    expect(codigos(compararExcelConOdoo(entrada({ filas: conFila("FAC/2026/0209", { total: 15226.74 }) })))).not.toContain("MONTO_DISTINTO-USD");
    expect(linea(compararExcelConOdoo(entrada({ filas: conFila("FAC/2026/0209", { total: 15226.73 }) })), "MONTO_DISTINTO-USD").montoEnJuego).toBe(0.02);
  });

  it("⛔ nunca con el «pendiente» del Excel, que viene en colones: Global Supply 0206 no tiene diferencia", () => {
    expect(base.inconsistencias.some((x) => x.codigo.startsWith("MONTO_DISTINTO"))).toBe(false);
  });
});

describe("6 · moneda distinta, y ⛔ nunca colones con «$»", () => {
  const r = compararExcelConOdoo(entrada({ filas: conFila("FAC/2026/0345", { moneda: "USD" }) }));

  it("McCann 0345 anotada en dólares: la línea va en colones, con el monto de la factura de Odoo", () => {
    const x = linea(r, "MONEDA_DISTINTA-CRC");
    expect(numeros(x)).toEqual(["FAC/2026/0345"]);
    expect(x.montoEnJuego).toBe(13041612.44);
    expect(x.items[0]?.nota).toBe("El Excel: US$13.041.612,44 · Odoo: ₡13.041.612,44 · septiembre de 2026");
    expect(codigos(r).some((c) => c.startsWith("MONTO_DISTINTO"))).toBe(false);
  });

  it("ninguna línea en dólares carga los millones de McCann, y la factura queda afuera de lo pendiente", () => {
    for (const x of r.inconsistencias.filter((i) => i.moneda === "USD")) expect(x.montoEnJuego ?? 0).toBeLessThan(1_000_000);
    expect(r.pendiente.find((p) => p.moneda === "USD")?.segunExcel).toBeLessThan(1_000_000);
    expect(r.pendiente.find((p) => p.moneda === "CRC")).toMatchObject({ facturas: 2, segunExcel: 26083224.88, segunOdoo: 26083224.88 });
  });
});

describe("7 · notas de crédito sin aplicar, de clientes del Excel", () => {
  it("las dos de Global Supply por $2.109,71 y la de Publimark; no la ya aplicada, no la anulada, no la de un cliente ajeno", () => {
    const x = linea(base, "NOTA_DE_CREDITO_SIN_APLICAR-USD");
    expect(numeros(x)).toEqual(["FAC/2026/0246", "FAC/2025/0249", "FAC/2026/0248"]);
    expect(x.items.filter((it) => it.texto.includes("GLOBAL SUPPLY")).map((it) => it.monto)).toEqual([2109.71, 2109.71]);
    expect(x).toMatchObject({ montoEnJuego: 19446.17, resuelve: "DIRECCION" });
  });

  it("el cliente se reconoce también por el nombre, cuando su factura no está en la copia (McCann sin paréntesis)", () => {
    const facturas = [
      ...espejo.filter((f) => !f.numero.startsWith("FAC/2026/034")),
      factura({ numero: "NC/2026/0020", moveType: "out_refund", moneda: "CRC", odooPartnerId: 999, odooPartnerNombre: MCCANN_ODOO, montoTotal: 500000, invoiceDate: "2026-09-11" }),
    ];
    expect(numeros(linea(compararExcelConOdoo(entrada({ facturas })), "NOTA_DE_CREDITO_SIN_APLICAR-CRC"))).toEqual(["NC/2026/0020"]);
  });
});

/* ── Lo pendiente y el orden ────────────────────────────────────────────────────── */

describe("lo pendiente, por moneda, sobre lo que está en los dos", () => {
  it("dólares: el Excel cuenta 0206 y 0225; Odoo, 0206 y 0210. ⛔ Nunca el «pendiente» en colones de 0206", () => {
    expect(base.pendiente.map((p) => p.moneda)).toEqual(["USD", "CRC"]);
    expect(base.pendiente[0]).toEqual({ moneda: "USD", facturas: 7, segunExcel: 2731.21, segunOdoo: 17336.46 });
  });

  it("colones: las tres de McCann, igual en los dos", () => {
    expect(base.pendiente[1]).toEqual({ moneda: "CRC", facturas: 3, segunExcel: 39124837.32, segunOdoo: 39124837.32 });
  });
});

describe("una línea por moneda", () => {
  const r = compararExcelConOdoo(
    entrada({ filas: conFila("FAC/2026/0343", { estado: "PAGADO" }) }),
  );

  it("el mismo punto en las dos monedas son dos líneas, dólares primero, y el título dice cuál es cuál", () => {
    const pagadas = r.inconsistencias.filter((x) => x.codigo.startsWith("EXCEL_PAGADA_ODOO_NO"));
    expect(pagadas.map((x) => [x.codigo, x.moneda])).toEqual([
      ["EXCEL_PAGADA_ODOO_NO-USD", "USD"],
      ["EXCEL_PAGADA_ODOO_NO-CRC", "CRC"],
    ]);
    expect(pagadas.map((x) => x.titulo)).toEqual([
      "Una factura que el Excel da por pagada y Odoo no · en dólares",
      "Una factura que el Excel da por pagada y Odoo no · en colones",
    ]);
  });

  it("con una sola moneda el título no la nombra, y cada código es único", () => {
    expect(linea(base, "EXCEL_PAGADA_ODOO_NO-USD").titulo).toBe("Una factura que el Excel da por pagada y Odoo no");
    expect(new Set(codigos(r)).size).toBe(codigos(r).length);
  });

  it("el titular del panel dice una cifra por moneda y nunca las junta", () => {
    const resumen = resumirInconsistencias(r.inconsistencias);
    expect(resumen.montoPorMoneda.map((m) => m.moneda)).toEqual(["USD", "CRC"]);
    expect(resumen.montoPorMoneda.find((m) => m.moneda === "CRC")?.monto).toBe(13041612.44);
    expect(resumen.montoTotal).toBe(0);
  });

  it("el reporte de equilibrio (líneas sin moneda propia) sigue sumando igual que antes", () => {
    const sinMoneda = r.inconsistencias.filter((x) => x.moneda === "USD").map((x) => ({ ...x, moneda: undefined }));
    const resumen = resumirInconsistencias(sinMoneda);
    expect(resumen.montoPorMoneda).toEqual([{ moneda: null, monto: resumen.montoTotal }]);
    expect(resumen.montoTotal).toBe(Math.round(sinMoneda.reduce((n, x) => n + (x.montoEnJuego ?? 0), 0) * 100) / 100);
  });
});

/* ── Frescura y año ─────────────────────────────────────────────────────────────── */

describe("avisos de frescura", () => {
  it("cuenta los días entre dos fechas", () => {
    expect(diasEntre("2026-08-31", "2026-09-13")).toBe(13);
    expect(diasEntre("2026-09-13", "2026-09-13")).toBe(0);
  });

  it("un Excel de hace una semana o menos no avisa; uno más viejo que la copia de Odoo, sí", () => {
    expect(avisosDeFrescura({ excelDelDia: "2026-09-06", odooDelDia: "2026-09-13", odooAtrasado: false })).toEqual([]);
    const avisos = avisosDeFrescura({ excelDelDia: "2026-09-01", odooDelDia: "2026-09-13", odooAtrasado: false });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/^El Excel es 12 días más viejo que la copia de Odoo/);
  });

  it("la copia de Odoo atrasada avisa, y sin ninguna copia buena ese es el único aviso", () => {
    expect(avisosDeFrescura({ excelDelDia: "2026-09-13", odooDelDia: "2026-09-12", odooAtrasado: true })[0]).toMatch(/atrasada/);
    expect(avisosDeFrescura({ excelDelDia: "2026-09-01", odooDelDia: null, odooAtrasado: true })).toHaveLength(1);
  });
});

describe("el año que lista el Excel", () => {
  it("el de sus facturas de Odoo, no el de hoy", () => {
    expect(anioDelExcel(excel, 2027)).toBe(2026);
  });

  it("sin facturas de Odoo, el que se le pasa", () => {
    expect(anioDelExcel(excel.filter((f) => f.seccion === "MERCURY"), 2027)).toBe(2027);
  });
});
