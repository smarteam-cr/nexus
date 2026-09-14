/**
 * lib/cobranza/odoo/numero-propuesta.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/odoo/numero-propuesta.test.ts --project unit`.
 *
 * Los números son los del libro y el espejo reales (2026-09-12). IIA junio y Seléctrica junio son dos de
 * las tres facturas que vuelven a por cobrar: Alex las anota primero (0206, 0295 y 0302).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FilaLibro } from "../libro-alex-lectura";
import type { ContextoLibro } from "../libro-alex";
import { cobroDeNexus, facturaDelEspejo, filaDelLibro } from "../__fixtures__/libro-alex";
import { proponerNumeros } from "./numero-propuesta";

const ODOO = "Asiento Contable por Mes ODOO";
const HOY = "2026-09-13";

const ctx: ContextoLibro = {
  cuentas: [
    { cuentaId: "iia", nombre: "IIA", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "sel", nombre: "Seléctrica", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "almotec", nombre: "ALMOTEC", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "insider", nombre: "Insider Digital", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
    { cuentaId: "real", nombre: "Real Shipping & Trade", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
    { cuentaId: "otra", nombre: "Electrocaribe", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
  ],
  vinculos: [
    { odooPartnerId: 1, odooPartnerNombre: "ILEANA AGUILAR INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA", cuentaId: "iia", ignorado: false },
    { odooPartnerId: 5, odooPartnerNombre: "SOLIS ELECTRICA SOCIEDAD DE RESPONSABILIDAD LIMITADA", cuentaId: "sel", ignorado: false },
    { odooPartnerId: 3, odooPartnerNombre: "CORPORACION ALMOTEC SOCIEDAD ANONIMA", cuentaId: "almotec", ignorado: false },
  ],
  facturas: [
    facturaDelEspejo({ numero: "FAC/2026/0278", odooPartnerId: 1, montoNeto: 60, invoiceDate: "2026-05-05" }),
    facturaDelEspejo({ numero: "FAC/2026/0295", odooPartnerId: 1, montoNeto: 60, invoiceDate: "2026-06-10" }),
    facturaDelEspejo({ numero: "FAC/2026/0302", odooPartnerId: 5, montoNeto: 45, invoiceDate: "2026-06-17" }),
    facturaDelEspejo({ numero: "FAC/2026/0316", odooPartnerId: 5, montoNeto: 45, invoiceDate: "2026-07-28" }),
    /* Una nota de crédito del mismo monto y la misma fecha que la cuota de julio de Seléctrica. */
    facturaDelEspejo({ numero: "NC/2026/0005", odooPartnerId: 5, montoNeto: 45, invoiceDate: "2026-07-28", moveType: "out_refund" }),
    /* Ya anotada en un cobro de otra cuenta. */
    facturaDelEspejo({ numero: "FAC/2026/0290", odooPartnerId: 5, montoNeto: 45, invoiceDate: "2026-07-29" }),
    facturaDelEspejo({ numero: "FAC/2026/0329", odooPartnerId: 3, montoNeto: 6900, invoiceDate: "2026-08-19" }),
  ],
  cobros: [
    cobroDeNexus({ id: "iia-may", cuentaId: "iia", periodo: "2026-05", monto: 60, estado: "COBRADO", fechaEmision: "2026-05-30" }),
    cobroDeNexus({ id: "iia-jun", cuentaId: "iia", periodo: "2026-06", monto: 60, estado: "COBRADO", fechaEmision: "2026-06-30" }),
    cobroDeNexus({ id: "sel-jun", cuentaId: "sel", periodo: "2026-06", monto: 45, estado: "COBRADO", fechaEmision: "2026-06-15" }),
    cobroDeNexus({ id: "sel-jul", cuentaId: "sel", periodo: "2026-07", monto: 45, estado: "POR_COBRAR", fechaEmision: "2026-07-28" }),
    cobroDeNexus({ id: "sel-ago", cuentaId: "sel", periodo: "2026-08", monto: 45, estado: "POR_COBRAR", fechaEmision: "2026-07-30" }),
    ...["06", "07", "08"].map((m) => cobroDeNexus({ id: `almotec-${m}`, cuentaId: "almotec", periodo: `2026-${m}`, monto: 2300, fechaEmision: "2026-08-19" })),
    cobroDeNexus({ id: "insider-jun", cuentaId: "insider", periodo: "2026-06", monto: 5226, fechaEmision: "2026-06-05" }),
    cobroDeNexus({ id: "real-oct", cuentaId: "real", periodo: "2026-10", monto: 1000 }),
    cobroDeNexus({ id: "otra-jul", cuentaId: "otra", periodo: "2026-07", monto: 45, estado: "COBRADO", fechaEmision: "2026-07-29", numeroFactura: "FAC/2026/0290" }),
  ],
  aliados: ["Atom Chat"],
  servicios: [],
};

const libro: FilaLibro[] = [
  filaDelLibro({ hoja: ODOO, fila: 59, seccion: "ODOO", numero: "FAC/2026/0278", cliente: "ILEANA AGUILAR INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA", total: 67.8, estado: "PAGADO", periodo: "2026-05", fechaFactura: "2026-05-05" }),
  filaDelLibro({ hoja: ODOO, fila: 74, seccion: "ODOO", numero: "FAC/2026/0295", cliente: "ILEANA AGUILAR INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA", total: 67.8, estado: "SIN_PAGAR", periodo: "2026-06", fechaFactura: "2026-06-10" }),
  filaDelLibro({ hoja: ODOO, fila: 79, seccion: "ODOO", numero: "FAC/2026/0302", cliente: "SOLIS ELECTRICA SOCIEDAD DE RESPONSABILIDAD LIMITADA", total: 50.85, estado: "SIN_PAGAR", periodo: "2026-06", fechaFactura: "2026-06-17" }),
  filaDelLibro({ hoja: ODOO, fila: 90, seccion: "ODOO", numero: "NC/2026/0005", cliente: "SOLIS ELECTRICA SOCIEDAD DE RESPONSABILIDAD LIMITADA", total: -50.85, periodo: "2026-07", fechaFactura: "2026-07-28" }),
  filaDelLibro({ hoja: ODOO, fila: 91, seccion: "ODOO", numero: "FAC/2026/0290", cliente: "SOLIS ELECTRICA SOCIEDAD DE RESPONSABILIDAD LIMITADA", total: 50.85, estado: "PAGADO", periodo: "2026-07", fechaFactura: "2026-07-29" }),
  filaDelLibro({ hoja: ODOO, fila: 108, seccion: "ODOO", numero: "FAC/2026/0329", cliente: "CORPORACION ALMOTEC SOCIEDAD ANONIMA", total: 7797, estado: "SIN_PAGAR", periodo: "2026-08", fechaFactura: "2026-08-19" }),
  filaDelLibro({ hoja: "Asientos Contables Mercury Bank", fila: 41, seccion: "MERCURY", numero: "INV-26", cliente: "INSIDER DIGITAL SOCIEDAD ANONIMA DE CAPITAL VARIABLE / IDI220418NB4", total: 5226, estado: "PAGADO", periodo: "2026-06", fechaFactura: "2026-06-05" }),
  filaDelLibro({ hoja: "Asientos Contables Mercury Bank", fila: 78, seccion: "MERCURY", numero: "INV-16", cliente: "Real Shipping and Trade, SA DE CV", total: 1000, estado: "ACTIVA", periodo: "2026-10", fechaFactura: "2026-10-01" }),
];

const numeros = proponerNumeros(libro, ctx, HOY);
const cuota = (cobroId: string) => numeros.cuotas.find((q) => q.cobroId === cobroId);
const propuestos = numeros.cuotas.map((q) => q.opcion.numero);

describe("el número sale del libro: número y mes llevan a la cuota", () => {
  it("IIA junio da FAC/2026/0295, con la fecha del documento", () => {
    expect(cuota("iia-jun")?.opcion).toMatchObject({
      numero: "FAC/2026/0295",
      origen: "LIBRO",
      enEspejo: true,
      patch: { numeroFactura: "FAC/2026/0295", fechaEmision: "2026-06-10" },
    });
  });

  it("Seléctrica junio da FAC/2026/0302", () => {
    expect(cuota("sel-jun")?.opcion.numero).toBe("FAC/2026/0302");
  });

  it("ALMOTEC: la misma factura para las tres cuotas, dicho", () => {
    for (const id of ["almotec-06", "almotec-07", "almotec-08"]) {
      expect(cuota(id)?.opcion).toMatchObject({ numero: "FAC/2026/0329", cuotas: 3 });
    }
  });

  it("una factura con fecha futura no se propone todavía", () => {
    expect(cuota("real-oct")).toBeUndefined();
    expect(numeros.sinCuota.find((s) => s.numero === "INV-16")?.motivo).toMatch(/fecha futura/);
  });
});

describe("⛔ lo que nunca se propone", () => {
  it("una nota de crédito, ni desde el libro ni desde el espejo", () => {
    expect(propuestos).not.toContain("NC/2026/0005");
    expect(numeros.sinCuota.find((s) => s.numero === "NC/2026/0005")?.motivo).toMatch(/nota de crédito/);
  });

  it("una factura ya anotada en otro cobro", () => {
    expect(propuestos).not.toContain("FAC/2026/0290");
    expect(numeros.yaAnotados).toBe(1);
  });

  it("INV-26/27: el fondo de marketing de Insider no es el número de un cobro, aunque el monto coincida", () => {
    expect(cuota("insider-jun")).toBeUndefined();
    expect(numeros.sinCuota.find((s) => s.numero === "INV-26")?.motivo).toMatch(/Ingresos variables/);
  });

  it("⛔ lo que manda «Es esta» es el número y, a lo sumo, la fecha de emisión: nunca un estado", () => {
    for (const q of numeros.cuotas) expect(Object.keys(q.opcion.patch).sort()).toEqual(expect.arrayContaining(["numeroFactura"]));
    for (const q of numeros.cuotas) {
      for (const k of Object.keys(q.opcion.patch)) expect(["numeroFactura", "fechaEmision"]).toContain(k);
    }
  });
});

describe("las cuotas que el libro no nombra: el espejo, por monto y fecha", () => {
  it("julio de Seléctrica recibe FAC/2026/0316 (mismo monto, mismo día) y no la nota de crédito", () => {
    expect(cuota("sel-jul")?.opcion).toMatchObject({ numero: "FAC/2026/0316", origen: "ESPEJO" });
  });

  it("⚠ una factura del espejo no se ofrece a dos cuotas: agosto no recibe la 0316 de julio", () => {
    expect(cuota("sel-ago")?.opcion.numero).not.toBe("FAC/2026/0316");
  });

  it("un número que el libro tiene no lo ofrece el espejo a otra cuota", () => {
    const delEspejo = numeros.cuotas.filter((q) => q.opcion.origen === "ESPEJO").map((q) => q.opcion.numero);
    for (const f of libro) expect(delEspejo).not.toContain(f.numero);
  });
});

/* ⚠ Arriba, la nota de crédito, la factura tomada e INV-26 también están en el libro, y el libro las
   descarta antes de que el espejo las vea: sacar el filtro del espejo dejaba esas pruebas en verde.
   Acá el libro no las nombra y las tres empatan en fecha con la cuota, así que solo las frena el espejo. */
describe("⛔ el espejo solo, sin el libro: tampoco propone lo que nunca se propone", () => {
  const soloEspejo: ContextoLibro = {
    cuentas: [
      { cuentaId: "sel", nombre: "Seléctrica", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
      { cuentaId: "otra", nombre: "Electrocaribe", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    ],
    vinculos: [{ odooPartnerId: 5, odooPartnerNombre: "SOLIS ELECTRICA SOCIEDAD DE RESPONSABILIDAD LIMITADA", cuentaId: "sel", ignorado: false }],
    facturas: [
      facturaDelEspejo({ numero: "NC/2026/0009", odooPartnerId: 5, montoNeto: 45, invoiceDate: "2026-09-02", moveType: "out_refund" }),
      facturaDelEspejo({ numero: "FAC/2026/0350", odooPartnerId: 5, montoNeto: 45, invoiceDate: "2026-09-02" }),
      facturaDelEspejo({ numero: "INV-27", odooPartnerId: 5, montoNeto: 45, invoiceDate: "2026-09-02" }),
      facturaDelEspejo({ numero: "FAC/2026/0351", odooPartnerId: 5, montoNeto: 45, invoiceDate: "2026-09-20" }),
    ],
    cobros: [
      cobroDeNexus({ id: "sel-sep", cuentaId: "sel", periodo: "2026-09", monto: 45, estado: "POR_COBRAR", fechaEmision: "2026-09-02" }),
      cobroDeNexus({ id: "otra-sep", cuentaId: "otra", periodo: "2026-09", monto: 45, estado: "POR_COBRAR", fechaEmision: "2026-09-02", numeroFactura: "FAC/2026/0350" }),
    ],
    aliados: [],
    servicios: [],
  };
  const soloDelEspejo = proponerNumeros([], soloEspejo, HOY);

  it("la cuota recibe la factura viva más lejana antes que la nota de crédito, la tomada o INV-27 del mismo día", () => {
    expect(soloDelEspejo.cuotas.find((q) => q.cobroId === "sel-sep")?.opcion).toMatchObject({ numero: "FAC/2026/0351", origen: "ESPEJO" });
    const propuestosDelEspejo = soloDelEspejo.cuotas.map((q) => q.opcion.numero);
    for (const nunca of ["NC/2026/0009", "FAC/2026/0350", "INV-27"]) expect(propuestosDelEspejo).not.toContain(nunca);
  });
});

/* ── ⛔ La pantalla solo manda el número ────────────────────────────────────────── */

const RAIZ = join(__dirname, "..", "..", "..");
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("⛔ «Es esta» no cambia el estado de un cobro", () => {
  const src = sinComentarios(readFileSync(join(RAIZ, "components/cobranza/NumerosFacturaOdoo.tsx"), "utf8"));

  it("manda al PATCH del cobro el `patch` de la propuesta, y nada más", () => {
    expect(src).toMatch(/\/api\/cobranza\/cobros\/\$\{[^}]+\}`/);
    expect(src).toMatch(/JSON\.stringify\(\w+\.opcion\.patch\)/);
  });

  it("no nombra ni el estado, ni la fecha de cobro, ni la confirmación", () => {
    expect(src).not.toMatch(/estado:\s*["']/);
    expect(src).not.toMatch(/fechaCobro|confirmadoPor|reversion/);
  });
});
