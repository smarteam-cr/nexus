import { describe, expect, it } from "vitest";
import { clasificarCuenta, type CuentaOdoo } from "./catalogo";
import {
  clasificarLinea,
  cuentasQueMiranAOtra,
  dominioDeLineas,
  dominioDePartnersDeSociedades,
  emparejarTraslados,
  mapearLineaContable,
  necesitaRevision,
  partnersDeSociedades,
  saldosEntreSociedades,
  type ContextoDeLosLibros,
  type LineaContable,
  type MovimientoCalculado,
} from "./entre-sociedades";

const SOC = [
  { id: "cr", nombre: "CR Smarteam", odooCompanyId: 1, alias: ["cr smarteam", "smarteam sociedad anonima"] },
  { id: "llc", nombre: "Smarteam Consultora LLC", odooCompanyId: null, alias: ["smarteam consult", "smarteam consultora", "smarteam consultoria"] },
  { id: "agro", nombre: "Smart Agro", odooCompanyId: null, alias: ["smartagro", "smarteam agropecuario"] },
  { id: "fly", nombre: "Flywheel", odooCompanyId: null, alias: ["flywheel"] },
];

const c = (id: number, codigo: string, nombre: string, tipo: string): CuentaOdoo => ({
  id, codigo, nombre, tipo, deprecada: false, conciliable: true, odooCompanyId: 1,
});
/** El catálogo medido el 2026-11-13, lo que importa. */
const CUENTAS = [
  c(110, "110202", "Transferencia interna", "asset_current"),
  c(220, "110303", "Cuenta por cobrar SmartAgro", "asset_receivable"),
  c(187, "110304", "Cuentas por Cobrar Flywheel Centroamerica S.A", "asset_current"),
  c(5, "110301", "CUENTAS POR COBRAR CLIENTES CRC", "asset_receivable"),
  c(155, "21105", "Cuentas por pagar (C/P) - USD", "liability_payable"),
  c(57, "410101", "CRM Implementation", "income"),
  c(900, "620199", "Gastos de Flywheel", "expense"),
].map(clasificarCuenta);

const { porCuenta, avisos } = cuentasQueMiranAOtra(CUENTAS, SOC);
const CTX: ContextoDeLosLibros = {
  sociedades: SOC,
  cuentas: new Map(CUENTAS.map((x) => [x.id, x])),
  cuentaDeSociedad: porCuenta,
  cuentasDeTraslado: new Set([110]),
  partnerDeSociedad: partnersDeSociedades(
    [
      { id: 1, nombre: "CR SMARTEAM SOCIEDAD ANONIMA" },
      { id: 265, nombre: "Smarteam Consultora LLC" },
      { id: 266, nombre: "Smarteam Consultoria LLC " },
      { id: 150, nombre: "FLYWHEEL CENTRO AMERICA" },
    ],
    SOC,
  ),
  monedaDeCompania: new Map([[1, "CRC"]]),
};

const linea = (p: Partial<LineaContable>): LineaContable => ({
  id: 1, fecha: "2026-10-15", asiento: "2026/00001", moveType: "entry", cuentaId: 110, partnerId: null, partnerNombre: null,
  concepto: null, ref: null, balance: 0, montoMoneda: 0, moneda: "CRC", conciliada: false, diario: "BAC Colones", odooCompanyId: 1, ...p,
});
const mov = (l: Partial<LineaContable>) => {
  const r = clasificarLinea(linea(l), CTX);
  if (!("movimiento" in r)) throw new Error(`no es movimiento: ${JSON.stringify(r)}`);
  return r.movimiento;
};

describe("qué cuentas miran a otra sociedad (por su nombre, nunca por su id)", () => {
  it("las cuentas por cobrar de Flywheel y Smart Agro; un gasto que nombra a Flywheel no es deuda y avisa", () => {
    expect([...porCuenta]).toEqual([
      [220, "agro"],
      [187, "fly"],
    ]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("620199");
  });

  it("los contactos que son sociedades, incluida la propia (que después se descarta como contraparte)", () => {
    expect([...CTX.partnerDeSociedad]).toEqual([
      [1, "cr"],
      [265, "llc"],
      [266, "llc"],
      [150, "fly"],
    ]);
  });
});

describe("cada línea de los libros de CR Smarteam", () => {
  it("✓ CR le transfiere dólares a Flywheel (110304, sin factura): Flywheel le debe más, en dólares", () => {
    const m = mov({ cuentaId: 187, balance: 14224712, montoMoneda: 28300, moneda: "USD", concepto: "TEF A : 950549816", diario: "BAC Dolares (USD)" });
    expect(m).toMatchObject({ sociedadId: "cr", contraparteId: "fly", monto: 28300, moneda: "USD", tipo: "MOVIMIENTO", respaldo: "SIN_RESPALDO" });
  });

  it("✓ una transferencia a la LLC por la cuenta de traslado: contraparte por el texto («SMARTEAM CONSULT»)", () => {
    const m = mov({ cuentaId: 110, balance: 1804080, montoMoneda: 4000, moneda: "USD", concepto: "W/T-S50080 SMARTEAM CONSULT" });
    expect(m).toMatchObject({ contraparteId: "llc", tipo: "TRANSFERENCIA", respaldo: "SIN_RESPALDO", monto: 4000 });
  });

  it("✓ el contacto es la propia CR, pero el texto nombra a la LLC: la contraparte es la LLC", () => {
    const m = mov({ cuentaId: 110, partnerId: 1, balance: -1585070.4, montoMoneda: -3480, moneda: "USD", concepto: "I002902359 Smarteam Consultora" });
    expect(m.contraparteId).toBe("llc");
  });

  it("✓ un traslado entre cuentas propias (contacto «CR SMARTEAM»): sin contraparte", () => {
    const m = mov({ cuentaId: 110, partnerId: 1, balance: 2651790, concepto: "CR SMARTEAM SOCIEDAD ANONIMA" });
    expect(m).toMatchObject({ contraparteId: null, tipo: "TRANSFERENCIA", monto: 2651790, moneda: "CRC" });
  });

  it("✓ la factura de la LLC a CR (por pagar) resta, y su pago conciliado suma: con factura los dos", () => {
    const factura = mov({ cuentaId: 155, partnerId: 266, moveType: "in_invoice", balance: -6828150, montoMoneda: -15000, moneda: "USD", asiento: "COMPRA/2026/0151" });
    expect(factura).toMatchObject({ contraparteId: "llc", tipo: "FACTURA", respaldo: "FACTURA", monto: -15000, factura: "COMPRA/2026/0151" });
    const pago = mov({ cuentaId: 155, partnerId: 266, moveType: "entry", balance: 6828150, montoMoneda: 15000, moneda: "USD", conciliada: true });
    expect(pago).toMatchObject({ tipo: "MOVIMIENTO", respaldo: "FACTURA", monto: 15000 });
  });

  it("✗ lo que no tiene nada que ver: la cuenta por cobrar de un cliente, un ingreso", () => {
    expect(clasificarLinea(linea({ cuentaId: 5, partnerId: 35, balance: 1000 }), CTX)).toEqual({ ignorada: true });
    expect(clasificarLinea(linea({ cuentaId: 57, partnerId: 265, balance: -1000 }), CTX)).toEqual({ ignorada: true });
  });

  it("⚠ una compañía de Odoo que ninguna sociedad lleva: aviso, no se inventa de quién es", () => {
    expect(clasificarLinea(linea({ odooCompanyId: 2 }), CTX)).toHaveProperty("aviso");
  });
});

describe("las dos mitades de un traslado propio", () => {
  const traslado = (id: number, fecha: string, balance: number, extra: Partial<MovimientoCalculado> = {}): MovimientoCalculado => ({
    odooLineId: id, odooCompanyId: 1, fecha, sociedadId: "cr", contraparteId: null, monto: balance, moneda: "CRC", balance,
    tipo: "TRANSFERENCIA", respaldo: "SIN_RESPALDO", concepto: null, asiento: null, cuentaContable: null, diario: null, factura: null, ...extra,
  });

  it("✓ medido: sale ₡3.333.000 de BAC Colones y entra el mismo monto en BAC Dólares el mismo día", () => {
    const r = emparejarTraslados([traslado(1, "2026-03-14", -3333000), traslado(2, "2026-03-14", 3333000), traslado(3, "2026-01-02", -1780000)]);
    expect(r.map((m) => m.respaldo)).toEqual(["CONCILIADA", "CONCILIADA", "SIN_RESPALDO"]);
  });

  it("✗ a más de 5 días, o con otro monto, no son la misma plata", () => {
    const r = emparejarTraslados([traslado(1, "2026-03-01", -1000), traslado(2, "2026-03-09", 1000), traslado(3, "2026-03-01", -1000.01), traslado(4, "2026-03-02", 1000)]);
    expect(r.map((m) => m.respaldo)).toEqual(["CONCILIADA", "SIN_RESPALDO", "SIN_RESPALDO", "CONCILIADA"]);
  });

  it("no toca lo que cruza entre sociedades ni lo que ya tiene respaldo", () => {
    const r = emparejarTraslados([traslado(1, "2026-03-01", -500, { contraparteId: "llc" }), traslado(2, "2026-03-01", 500)]);
    expect(r.map((m) => m.respaldo)).toEqual(["SIN_RESPALDO", "SIN_RESPALDO"]);
  });
});

describe("el saldo acumulado de cada par", () => {
  const m = (sociedadId: string, contraparteId: string | null, monto: number, moneda = "USD", estado = "VIGENTE", fecha = "2026-10-01") => ({
    sociedadId, contraparteId, monto, moneda, estado, fecha,
  });

  it("CRC y USD no se suman; la factura pagada queda en cero", () => {
    const s = saldosEntreSociedades([m("cr", "fly", 28300), m("cr", "fly", 250000, "CRC"), m("cr", "llc", -15000), m("cr", "llc", 15000)]);
    expect(s).toEqual([
      { deudoraId: "fly", acreedoraId: "cr", moneda: "CRC", saldo: 250000, movimientos: 1, ultimaFecha: "2026-10-01" },
      { deudoraId: "fly", acreedoraId: "cr", moneda: "USD", saldo: 28300, movimientos: 1, ultimaFecha: "2026-10-01" },
      { deudoraId: "llc", acreedoraId: "cr", moneda: "USD", saldo: 0, movimientos: 2, ultimaFecha: "2026-10-01" },
    ]);
  });

  it("junta lo de los libros de una con lo anotado en los de la otra (el par es el mismo)", () => {
    const s = saldosEntreSociedades([m("cr", "agro", 1000), m("agro", "cr", 300)]);
    expect(s[0]).toMatchObject({ deudoraId: "agro", acreedoraId: "cr", saldo: 700 });
  });

  it("si la de los libros es la que debe, el saldo lo dice al revés", () => {
    expect(saldosEntreSociedades([m("cr", "llc", -15000)])[0]).toMatchObject({ deudoraId: "cr", acreedoraId: "llc", saldo: 15000 });
  });

  it("sin contraparte, desaparecido o anulado no suma", () => {
    expect(saldosEntreSociedades([m("cr", null, 5), m("cr", "fly", 5, "USD", "DESAPARECIDA"), m("cr", "fly", 5, "USD", "ANULADA")])).toEqual([]);
  });
});

describe("leer y pedir a Odoo", () => {
  it("mapea una línea cruda y rechaza la que no tiene cuenta", () => {
    const r = mapearLineaContable({
      id: 7213, date: "2026-11-10", move_id: [2358, "2026/00412"], move_type: "entry", account_id: [110, "110202 Transferencia interna"],
      partner_id: false, name: "W/T-S50080 SMARTEAM CONSULT", ref: false, balance: 1804080, amount_currency: 4000, currency_id: [1, "USD"],
      reconciled: false, full_reconcile_id: false, journal_id: [8, "BAC Dolares (USD)"], company_id: [1, "CR SMARTEAM SOCIEDAD ANONIMA"],
    });
    expect(r).toEqual({
      linea: {
        id: 7213, fecha: "2026-11-10", asiento: "2026/00412", moveType: "entry", cuentaId: 110, partnerId: null, partnerNombre: null,
        concepto: "W/T-S50080 SMARTEAM CONSULT", ref: null, balance: 1804080, montoMoneda: 4000, moneda: "USD", conciliada: false,
        diario: "BAC Dolares (USD)", odooCompanyId: 1,
      },
    });
    expect(mapearLineaContable({ id: 1, date: "2026-01-01", account_id: false, balance: 1 })).toHaveProperty("rechazo");
  });

  it("los dominios: N alias con N−1 «o» delante; las líneas, publicadas", () => {
    expect(dominioDePartnersDeSociedades([{ id: "a", nombre: "A", odooCompanyId: null, alias: ["flywheel", "smartagro", "x1"] }])).toEqual([
      "|",
      ["name", "ilike", "flywheel"],
      ["name", "ilike", "smartagro"],
    ]);
    expect(dominioDePartnersDeSociedades([{ id: "a", nombre: "A", odooCompanyId: null, alias: [] }])).toBeNull();
    expect(dominioDeLineas([110], [])).toEqual(["&", ["parent_state", "=", "posted"], ["account_id", "in", [110]]]);
    expect(dominioDeLineas([110], [265])[0]).toBe("&");
  });

  it("a la lista de revisar va lo vigente, sin respaldo y sin aceptar", () => {
    expect(necesitaRevision({ respaldo: "SIN_RESPALDO", estado: "VIGENTE", aceptadoEn: null })).toBe(true);
    expect(necesitaRevision({ respaldo: "SIN_RESPALDO", estado: "VIGENTE", aceptadoEn: new Date() })).toBe(false);
    expect(necesitaRevision({ respaldo: "FACTURA", estado: "VIGENTE", aceptadoEn: null })).toBe(false);
    expect(necesitaRevision({ respaldo: "SIN_RESPALDO", estado: "DESAPARECIDA", aceptadoEn: null })).toBe(false);
  });
});
