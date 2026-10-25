/**
 * lib/cobranza/odoo/banco.test.ts — las líneas del banco de Odoo sin conciliar (U15): cómo se leen, qué les pasa a las
 * que se van, la pista de factura, y sus dos filas en «Lo que no cuadra» (fuera de «por resolver»).
 *
 * Correr: `npx vitest run lib/cobranza/odoo/banco.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import {
  cierreDeLasQueSeFueron,
  dominioBancoSinConciliar,
  facturasQueNombra,
  facturasQuePodriaPagar,
  huellaDeMovimiento,
  mapearLineaDelBanco,
  type FacturaConSaldo,
  type MovimientoDelBancoParaCruzar,
} from "./banco";
import {
  detectarDiferenciasOdoo,
  resumenDeDiferencias,
  type DocumentoDelLibro,
  type EstadoDelCruce,
  type FacturaParaCruzar,
  type MarcaDeFila,
  type ServicioParaCruzar,
} from "./diferencias";
import { porDocumento } from "@/lib/finanzas/conciliacion-por-documento";
import { filasPorQuien } from "@/lib/finanzas/conciliacion";

/** La fila real de Multiquímica del 2026-10-21, como la devuelve Odoo. */
const MULTIQUIMICA = {
  id: 877,
  date: "2026-10-21",
  payment_ref: "I003938302 MULTIQUIMICA DOMINI",
  partner_id: false,
  partner_name: false,
  amount: 3380,
  amount_currency: 0,
  foreign_currency_id: false,
  currency_id: [1, "USD"],
  journal_id: [8, "BAC Dolares (USD)"],
  statement_id: [86, "BAC 05-10-2026 - 21-10-2026"],
  move_id: [2166, "2026/00385"],
  is_reconciled: false,
  state: "posted",
};

describe("la lectura de una línea del banco", () => {
  it("lee la fila real: monto con signo, moneda, diario, extracto y asiento; sin cliente es null", () => {
    expect(mapearLineaDelBanco(MULTIQUIMICA)).toEqual({
      linea: {
        odooLineId: 877,
        fecha: "2026-10-21",
        monto: 3380,
        moneda: "USD",
        montoOtraMoneda: null,
        otraMoneda: null,
        referencia: "I003938302 MULTIQUIMICA DOMINI",
        odooPartnerId: null,
        odooPartnerNombre: null,
        odooJournalId: 8,
        diario: "BAC Dolares (USD)",
        extracto: "BAC 05-10-2026 - 21-10-2026",
        asiento: "2026/00385",
        conciliada: false,
      },
    });
  });

  it("una salida queda negativa; el cliente y la otra moneda se leen cuando vienen", () => {
    const r = mapearLineaDelBanco({
      ...MULTIQUIMICA,
      amount: -22000,
      currency_id: [39, "CRC"],
      partner_id: [55, "RESTAURANTE DI VINO"],
      foreign_currency_id: [1, "USD"],
      amount_currency: -42.5,
    });
    expect("linea" in r && r.linea).toMatchObject({ monto: -22000, moneda: "CRC", odooPartnerId: 55, odooPartnerNombre: "RESTAURANTE DI VINO", montoOtraMoneda: -42.5, otraMoneda: "USD" });
  });

  it("sin fecha, monto, moneda o diario no se copia, y dice por qué", () => {
    expect(mapearLineaDelBanco({ ...MULTIQUIMICA, date: false })).toEqual({ rechazo: "línea 877: sin fecha" });
    expect(mapearLineaDelBanco({ ...MULTIQUIMICA, currency_id: false })).toEqual({ rechazo: "línea 877: sin moneda" });
    expect(mapearLineaDelBanco({ ...MULTIQUIMICA, journal_id: false })).toEqual({ rechazo: "línea 877: sin diario" });
    expect(mapearLineaDelBanco({ ...MULTIQUIMICA, amount: "x" })).toEqual({ rechazo: "línea 877: sin monto" });
  });

  it("solo se leen las publicadas sin conciliar", () => {
    expect(dominioBancoSinConciliar()).toEqual([["is_reconciled", "=", false], ["state", "=", "posted"]]);
  });
});

describe("las que dejaron de venir", () => {
  it("conciliada si Odoo la devuelve conciliada; desaparecida si no la devuelve o la devuelve sin conciliar (borrador)", () => {
    const r = cierreDeLasQueSeFueron([1, 2, 3], [{ odooLineId: 1, conciliada: true }, { odooLineId: 3, conciliada: false }]);
    expect([...r]).toEqual([[1, "CONCILIADA"], [2, "DESAPARECIDA"], [3, "DESAPARECIDA"]]);
  });
});

const conSaldo = (p: Partial<FacturaConSaldo>): FacturaConSaldo => ({ numero: "FAC/2026/0400", moneda: "USD", saldo: 3380, odooPartnerNombre: "MULTIQUIMICA DOMINICANA SRL", ...p });

describe("qué factura podría pagar una entrada", () => {
  const entrada = { monto: 3380, moneda: "USD", referencia: "I003938302 MULTIQUIMICA DOMINI" };

  it("primero las de saldo exacto en la misma moneda", () => {
    const fs = [conSaldo({ numero: "A", saldo: 3380, odooPartnerNombre: "OTRA" }), conSaldo({ numero: "B", saldo: 3000 })];
    expect(facturasQuePodriaPagar(entrada, fs).map((f) => f.numero)).toEqual(["A"]);
  });

  it("sin saldo exacto, las del cliente cuyo nombre está en la referencia", () => {
    const fs = [conSaldo({ numero: "B", saldo: 3312.4 }), conSaldo({ numero: "C", saldo: 100, odooPartnerNombre: "GRUPO PRINTER" })];
    expect(facturasQuePodriaPagar(entrada, fs).map((f) => f.numero)).toEqual(["B"]);
  });

  it("nunca otra moneda, nunca una salida, nunca palabras genéricas («SOCIEDAD», «COSTA RICA»)", () => {
    expect(facturasQuePodriaPagar(entrada, [conSaldo({ moneda: "CRC" })])).toEqual([]);
    expect(facturasQuePodriaPagar({ ...entrada, monto: -3380 }, [conSaldo({})])).toEqual([]);
    expect(
      facturasQuePodriaPagar({ monto: 50, moneda: "USD", referencia: "TRANSFERENCIA SOCIEDAD COSTA RICA" }, [conSaldo({ saldo: 900, odooPartnerNombre: "ACME SOCIEDAD ANONIMA COSTA RICA" })]),
    ).toEqual([]);
  });
});

describe("la factura que nombra la referencia", () => {
  const fs = [
    conSaldo({ numero: "FAC/2026/0330", moneda: "CRC", saldo: 14091.26, odooPartnerNombre: "JUNTA DE DESARROLLO REGIONAL" }),
    conSaldo({ numero: "FAC/2026/0356", saldo: 621.5, odooPartnerNombre: "TOTAL FINCO" }),
  ];
  it("«CANCELA FACT 330» nombra la 330, en la moneda que sea", () => {
    expect(facturasQueNombra("CANCELA FACT 330", fs).map((f) => f.numero)).toEqual(["FAC/2026/0330"]);
    expect(facturasQueNombra("pago factura 2026/0356", fs).map((f) => f.numero)).toEqual(["FAC/2026/0356"]);
    expect(facturasQueNombra("FAC #330", fs).map((f) => f.numero)).toEqual(["FAC/2026/0330"]);
  });
  it("sin la palabra «factura» un número suelto no nombra nada (una referencia de transferencia)", () => {
    expect(facturasQueNombra("I003938302 MULTIQUIMICA", fs)).toEqual([]);
    expect(facturasQueNombra("TEF A : 330", fs)).toEqual([]);
    expect(facturasQueNombra(null, fs)).toEqual([]);
  });
});

/* ── Las dos filas en «Lo que no cuadra» ─────────────────────────────────────────── */

const mov = (p: Partial<MovimientoDelBancoParaCruzar> & { id: string }): MovimientoDelBancoParaCruzar => ({
  fecha: "2026-10-21",
  monto: 3380,
  moneda: "USD",
  referencia: "I003938302 MULTIQUIMICA DOMINI",
  diario: "BAC Dolares (USD)",
  asiento: "2026/00385",
  odooPartnerNombre: null,
  ...p,
});

const facturaPorCobrar: FacturaParaCruzar = {
  id: "f1",
  odooMoveId: 1,
  numero: "FAC/2026/0400",
  cuentaId: null,
  odooPartnerId: 10,
  odooPartnerNombre: "MULTIQUIMICA DOMINICANA SRL",
  invoiceDate: "2026-10-01",
  montoNeto: 2991.15,
  montoTotal: 3380,
  montoResidual: 3380,
  montoImpuesto: 388.85,
  moneda: "USD",
  moveType: "out_invoice",
  paymentState: "not_paid",
  state: "posted",
};

const estado = (banco: MovimientoDelBancoParaCruzar[], marcas: MarcaDeFila[] = [], facturas: FacturaParaCruzar[] = []): EstadoDelCruce => ({
  cobros: [],
  facturas,
  libro: new Map<string, DocumentoDelLibro>(),
  servicios: new Array<ServicioParaCruzar>(),
  liberaciones: [],
  cuentas: [],
  cuentasSinVinculo: 0,
  cuentasTotales: 0,
  cuentasVinculadas: new Set<string>(),
  ultimaCorridaOk: "2026-10-25",
  marcas,
  banco,
});

const ENTRADAS = "ODOO-BANCO-ENTRADA-SIN-CONCILIAR";
const SALIDAS = "ODOO-BANCO-SALIDA-SIN-CONCILIAR";

describe("las líneas del banco en «Lo que no cuadra»", () => {
  const banco = [
    mov({ id: "e1" }),
    mov({ id: "s1", monto: -22000, moneda: "CRC", referencia: "RESTAURANTE DI VINO", diario: "BAC Colones", fecha: "2026-10-23" }),
    mov({ id: "s2", monto: -445.43, referencia: "TEF A : 947484085", fecha: "2026-10-20", diario: "VISA 7732 Dolares (USD)" }),
  ];

  it("dos filas propias, entradas y salidas, con su monto por moneda y la pista de factura en la entrada", () => {
    const lineas = detectarDiferenciasOdoo(estado(banco, [], [facturaPorCobrar]));
    const e = lineas.find((l) => l.codigo === ENTRADAS)!;
    const s = lineas.find((l) => l.codigo === SALIDAS)!;
    expect(e.titulo).toBe("1 entrada de plata en el banco que Odoo no tiene atada a ninguna factura");
    expect(e.items).toHaveLength(1);
    expect(e.items[0]).toMatchObject({ texto: "I003938302 MULTIQUIMICA DOMINI · 2026-10-21 · BAC Dolares (USD)", monto: 3380, moneda: "USD" });
    expect(e.items[0]!.nota).toContain("Podría pagar FAC/2026/0400 (MULTIQUIMICA DOMINICANA SRL");
    expect(e.items[0]!.fila.clave).toBe("bo:e1");
    // El caso real de «CANCELA FACT 330»: calza por saldo con una y nombra otra; las dos pistas van juntas.
    const total: FacturaParaCruzar = { ...facturaPorCobrar, id: "f2", odooMoveId: 2, numero: "FAC/2026/0356", odooPartnerNombre: "TOTAL FINCO", montoTotal: 621.5, montoResidual: 621.5 };
    const judesur: FacturaParaCruzar = { ...facturaPorCobrar, id: "f3", odooMoveId: 3, numero: "FAC/2026/0330", odooPartnerNombre: "JUDESUR", moneda: "CRC", montoResidual: 14091.26, paymentState: "partial" };
    const cancela = detectarDiferenciasOdoo(estado([mov({ id: "e2", monto: 621.5, referencia: "CANCELA FACT 330" })], [], [total, judesur])).find((l) => l.codigo === ENTRADAS)!;
    expect(cancela.items[0]!.nota).toContain("Podría pagar FAC/2026/0356 (TOTAL FINCO");
    expect(cancela.items[0]!.nota).toContain("La referencia nombra FAC/2026/0330 (JUDESUR");
    expect(s.items.map((i) => i.fila.clave)).toEqual(["bo:s1", "bo:s2"]);
    expect(s.montos).toEqual([{ moneda: "USD", monto: 445.43 }, { moneda: "CRC", monto: 22000 }]);
    expect(s.detalle).toContain("BAC Colones (1), VISA 7732 Dolares (USD) (1)");
  });

  it("informan y no suman al encabezado: sin plata, y fuera de «por resolver» en la vista por documento", () => {
    const lineas = detectarDiferenciasOdoo(estado(banco));
    const delBanco = lineas.filter((l) => l.codigo === ENTRADAS || l.codigo === SALIDAS);
    expect(delBanco.every((l) => l.plata.length === 0)).toBe(true);
    expect(resumenDeDiferencias(delBanco)).toMatchObject({ abiertas: 0, filas: 0, filasDelBanco: 3, plata: [], documentos: 0 });
    const p = porDocumento(delBanco);
    expect(p.secciones.map((x) => [x.seccion, x.documentos])).toEqual([["BANCO", 3]]);
    expect(p.porResolver).toBe(0);
    expect(p.cambianLoCobrado).toBe(0);
    // El ejemplo corto lleva la referencia: es lo que identifica el movimiento.
    expect(p.secciones[0]!.razones.flatMap((r) => r.ejemplos.map((x) => x.texto))).toContain("I003938302 MULTIQUIMICA DOMINI · 2026-10-21");
    // «Resolver N diferencias» de Pendientes, Supervisión, «Para ti» y el cierre tampoco las cuenta.
    expect(filasPorQuien(lineas)).toEqual({ mias: 0, decisiones: 0 });
  });

  it("«Está bien así» por fila: la marcada sale de lo pendiente, y vuelve si cambia el monto", () => {
    const e1 = mov({ id: "e1" });
    const marca: MarcaDeFila = {
      id: "m1",
      linea: ENTRADAS,
      fila: "bo:e1",
      documento: "bo:e1",
      huella: huellaDeMovimiento(e1),
      motivo: "Es un aporte de capital",
      marcadaPor: "alex@smarteamcr.com",
      marcadaEn: "2026-10-26T15:00:00.000Z",
    };
    const marcada = detectarDiferenciasOdoo(estado([e1], [marca])).find((l) => l.codigo === ENTRADAS)!;
    expect(marcada.aceptada).toBe(true);
    expect(marcada.marcadas).toHaveLength(1);
    const cambio = detectarDiferenciasOdoo(estado([{ ...e1, monto: 3400 }], [marca])).find((l) => l.codigo === ENTRADAS)!;
    expect(cambio.aceptada).toBe(false);
    expect(cambio.items).toHaveLength(1);
  });

  it("sin la copia del banco (ausente o vacía) no sale ninguna fila del banco", () => {
    const sin = detectarDiferenciasOdoo({ ...estado([]), banco: undefined });
    expect(sin.some((l) => l.codigo === ENTRADAS || l.codigo === SALIDAS)).toBe(false);
  });
});
