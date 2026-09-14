/**
 * lib/finanzas/cobranza-contra-excel.test.ts
 *
 * Lo que se juega acá no es sumar: es que la diferencia entre Nexus y el Excel de Alex se explique
 * ENTERA y cada peso en un solo lugar. Por eso el caso que más importa es el invariante: las causas
 * suman la diferencia al centavo, en cada moneda, sin un «resto».
 *
 * Los montos son los del Excel cargado el 2026-09-14 y los de producción de ese día.
 *
 * ÍNDICE
 *   A. los totales de cada lado
 *   B. cada causa, con su caso real
 *   C. los emparejados que la comparación deja sueltos
 *   D. el invariante: las causas suman la diferencia
 *   E. rendimientoPorMoneda — la tarjeta por moneda
 */
import { describe, expect, it } from "vitest";
import type { CobranzaDeMoneda } from "@/lib/cobranza/antiguedad";
import type { FilaLibro } from "@/lib/cobranza/libro-alex-lectura";
import {
  enLaCalleContraExcel,
  esDeudaSinFactura,
  rendimientoPorMoneda,
  type CausaDeDiferencia,
  type DocumentoComparado,
  type EnLaCalleContraExcel,
  type PorCobrarDeNexus,
} from "./cobranza-contra-excel";

const HOY = "2026-09-14";

/** Una fila del Compendio. */
const resumen = (numero: string | null, cliente: string, pendiente: number, extra: Partial<FilaLibro> = {}): FilaLibro => ({
  hoja: "Compendio de Facturación Genera",
  fila: 1,
  seccion: "COMPENDIO",
  numero,
  cliente,
  proyecto: null,
  fechaFactura: null,
  fechaVencimiento: null,
  fechaPago: null,
  total: pendiente,
  pendiente,
  moneda: "USD",
  estado: null,
  periodo: null,
  color: "SIN_COLOR",
  anotacion: null,
  origen: "Odoo - Principal",
  ...extra,
});

const cuenta = (nombre: string) => ({ cuentaId: `cta-${nombre}`, nombre });

const doc = (clave: string, extra: Partial<DocumentoComparado> = {}): DocumentoComparado => ({
  clave,
  seccion: "ODOO",
  numero: clave,
  cliente: clave,
  fechaFactura: "2026-09-01",
  moneda: "USD",
  total: null,
  neto: null,
  veredicto: "COINCIDE",
  accion: "NINGUNA",
  atadura: "NUMERO",
  cuenta: null,
  cobros: [],
  ...extra,
});

const cuota = (id: string, estado = "POR_COBRAR", monto = 0, fechaEmision: string | null = "2026-09-01") => ({
  id,
  estado,
  fechaEmision,
  monto,
});

const nexus = (cobroId: string, nombre: string, monto: number, extra: Partial<PorCobrarDeNexus> = {}): PorCobrarDeNexus => ({
  cobroId,
  cuentaId: `cta-${nombre}`,
  cliente: nombre,
  moneda: "USD",
  monto,
  fechaEmision: "2026-09-01",
  numeroFactura: null,
  ...extra,
});

const causa = (r: EnLaCalleContraExcel | undefined, c: CausaDeDiferencia) => r?.causas.find((x) => x.causa === c);

// ── A ───────────────────────────────────────────────────────────────────────────

describe("A · los totales de cada lado", () => {
  it("A1 EL CASO REAL en colones: ₡39.920.993,51 del Excel contra ₡704.563 de Nexus, con McCann sin cuenta y el IVA de JUDESUR", () => {
    const r = enLaCalleContraExcel({
      filas: [
        resumen("FAC/2026/0231", "GRUPO SERVICA", 0, { moneda: "CRC", total: 101.7 }),
        resumen("FAC/2026/0330", "JUNTA DE DESARROLLO REGIONAL DE LA ZONA SUR", 796_156.19, { moneda: "CRC" }),
        resumen("FAC/2026/0312", "MCCANN ERICKSON", 0, { moneda: "CRC", total: 13_041_612.44 }),
        resumen("FAC/2026/0343", "MCCANN ERICKSON", 13_041_612.44, { moneda: "CRC" }),
        resumen("FAC/2026/0344", "MCCANN ERICKSON", 13_041_612.44, { moneda: "CRC" }),
        resumen("FAC/2026/0345", "MCCANN ERICKSON", 13_041_612.44, { moneda: "CRC" }),
      ],
      documentos: [
        doc("FAC/2026/0330", { cuenta: cuenta("JUDESUR"), total: 796_156.19, neto: 704_563, cobros: [cuota("judesur")] }),
        ...["FAC/2026/0312", "FAC/2026/0343", "FAC/2026/0344", "FAC/2026/0345"].map((n) =>
          doc(n, { veredicto: "SIN_CUENTA", accion: "CARGAR_CUENTA", cliente: "MCCANN ERICKSON", atadura: null }),
        ),
      ],
      porCobrar: [nexus("judesur", "JUDESUR", 704_563, { moneda: "CRC" })],
      hoyISO: HOY,
    });
    expect(r.CRC).toMatchObject({ excel: 39_920_993.51, nexus: 704_563, diferencia: 39_216_430.51 });
    expect(causa(r.CRC, "SIN_CUENTA")?.monto).toBe(39_124_837.32);
    expect(causa(r.CRC, "IVA")?.monto).toBe(91_593.19);
    expect(r.CRC!.causas.map((c) => c.causa)).toEqual(["SIN_CUENTA", "IVA"]);
  });

  it("A2 lo que no es del Compendio no suma al Excel: las pestañas de Odoo y Mercury ya están resumidas ahí", () => {
    const r = enLaCalleContraExcel({
      filas: [resumen("INV-38", "Multiquimica", 3400), { ...resumen("INV-38", "Multiquimica", 3400), seccion: "MERCURY", hoja: "Asientos" }],
      documentos: [doc("INV-38", { cuenta: cuenta("Multiquimica") })],
      porCobrar: [],
      hoyISO: HOY,
    });
    expect(r.USD!.excel).toBe(3400);
  });
});

// ── B ───────────────────────────────────────────────────────────────────────────

describe("B · cada causa, con su caso real", () => {
  const una = (filas: FilaLibro[], documentos: DocumentoComparado[], porCobrar: PorCobrarDeNexus[] = []) =>
    enLaCalleContraExcel({ filas, documentos, porCobrar, hoyISO: HOY }).USD!;

  it("B1 QuickBooks y «No inscritos» son deudas sin factura: Nexus no las cuenta", () => {
    expect(esDeudaSinFactura({ origen: "Odoo - QBs" })).toBe(true);
    expect(esDeudaSinFactura({ origen: "Mercury Bank - No Inscritos" })).toBe(true);
    expect(esDeudaSinFactura({ origen: "Mercury Bank - Principal" })).toBe(false);
    const r = una(
      [resumen("QBS-8", "Secure Title", 6000, { origen: "Odoo - QBs" }), resumen("NOINS-1", "Discover Puerto Rico", 2466, { origen: "Mercury Bank - No Inscritos" })],
      [],
    );
    expect(causa(r, "SIN_FACTURA")).toMatchObject({ monto: 8466 });
    expect(causa(r, "SIN_FACTURA")!.partidas.map((p) => p.cliente)).toEqual(["Secure Title", "Discover Puerto Rico"]);
  });

  it("B2 Publimark: la razón social no está ligada a ninguna cuenta", () => {
    const r = una(
      [resumen("FAC/2026/0308", "PUBLIMARK SOCIEDAD ANONIMA", 15_226.75), resumen("FAC/2026/0320", "PUBLIMARK SOCIEDAD ANONIMA", 15_226.75)],
      [doc("FAC/2026/0308", { veredicto: "SIN_CUENTA" }), doc("FAC/2026/0320", { veredicto: "SIN_CUENTA" })],
    );
    expect(causa(r, "SIN_CUENTA")?.monto).toBe(30_453.5);
  });

  it("B3 ALMOTEC: la misma factura en los dos lados, y lo que sobra es exactamente el IVA", () => {
    const r = una(
      [resumen("FAC/2026/0329", "ALMOTEC", 7797)],
      [
        doc("FAC/2026/0329", {
          cuenta: cuenta("ALMOTEC"),
          total: 7797,
          neto: 6900,
          atadura: "FECHA_DE_EMISION",
          cobros: [cuota("a1"), cuota("a2"), cuota("a3")],
        }),
      ],
      [nexus("a1", "ALMOTEC", 2300), nexus("a2", "ALMOTEC", 2300), nexus("a3", "ALMOTEC", 2300)],
    );
    expect(r.diferencia).toBe(897);
    expect(r.causas).toEqual([
      { causa: "IVA", monto: 897, partidas: [{ cliente: "ALMOTEC", numero: "FAC/2026/0329", monto: 897, que: "el Excel con IVA, Nexus sin IVA" }] },
    ]);
  });

  it("B4 Multiquimica INV-38: cobrada en Nexus y sin pagar en el Excel", () => {
    const r = una([resumen("INV-38", "Multiquimica", 3400)], [doc("INV-38", { cuenta: cuenta("Multiquimica"), cobros: [cuota("mq", "COBRADO", 3400)] })]);
    expect(causa(r, "NO_CUADRA")?.partidas[0]).toMatchObject({ monto: 3400, que: "cobrada en Nexus y sin pagar en el Excel" });
  });

  it("B5 Global Supply FAC/2026/0323: pagada según el Excel y por cobrar en Nexus", () => {
    const r = una(
      [resumen("FAC/2026/0323", "Global Supply S.A", 0, { total: 3837.48 })],
      [doc("FAC/2026/0323", { cuenta: cuenta("Global Supply S.A"), cobros: [cuota("gs")] })],
      [nexus("gs", "Global Supply S.A", 3396)],
    );
    expect(causa(r, "NO_CUADRA")?.partidas[0]).toMatchObject({ monto: -3396, que: "pagada según el Excel y por cobrar en Nexus" });
  });

  it("B6 Global Supply FAC/2026/0206: está en otra pestaña, pero el resumen del Excel no la suma", () => {
    const r = una([], [doc("FAC/2026/0206", { cuenta: cuenta("Global Supply S.A"), cobros: [cuota("gs206")] })], [nexus("gs206", "Global Supply S.A", 1867)]);
    expect(causa(r, "NO_CUADRA")?.partidas[0]).toMatchObject({ monto: -1867, que: "está en otra pestaña del Excel, pero su resumen no la suma" });
  });

  it("B7 Real Shipping INV-16 tiene fecha futura; Wherex INV-35 no tiene la factura en Nexus", () => {
    const r = una(
      [resumen("INV-16", "Real Shipping & Trade", 1000), resumen("INV-35", "Wherex", 2975)],
      [
        doc("INV-16", { cuenta: cuenta("Real Shipping & Trade"), fechaFactura: "2026-10-01", veredicto: "FALTA_EN_NEXUS" }),
        doc("INV-35", { cuenta: cuenta("Wherex"), fechaFactura: "2026-07-10", veredicto: "FALTA_EN_NEXUS" }),
      ],
    );
    expect(causa(r, "FALTA_CARGAR")).toMatchObject({ monto: 3975 });
    expect(causa(r, "FALTA_CARGAR")!.partidas.map((p) => p.que)).toEqual([
      "la cuenta no tiene esa factura en Nexus",
      "tiene fecha futura: cuenta cuando se emita",
    ]);
  });

  it("B8 una cuota atada que no está marcada facturada: falta cargarla, no es una contradicción", () => {
    const r = una(
      [resumen("INV-43", "Ferreteria Noelito", 289)],
      [doc("INV-43", { cuenta: cuenta("Ferreteria Noelito"), atadura: "MES", cobros: [cuota("noe", "PROGRAMADO", 289, null)] })],
    );
    expect(causa(r, "FALTA_CARGAR")?.partidas[0]?.que).toBe("en Nexus la cuota no está marcada facturada");
  });

  it("B9 Hotel Alta Las Palomas: Odoo la anuló y los dos lados la siguen contando", () => {
    const r = una(
      [resumen("FAC/2026/0225", "Hotel Alta Las Palomas", 621.5)],
      [doc("FAC/2026/0225", { cuenta: cuenta("Hotel Alta Las Palomas"), veredicto: "NO_ES_CARTERA", atadura: null })],
      [nexus("palomas", "Hotel Alta Las Palomas", 550)],
    );
    expect(causa(r, "NO_CUADRA")!.partidas.map((p) => [p.monto, p.que])).toEqual([
      [621.5, "anulada en Odoo y el Excel la sigue sumando"],
      [-550, "anulada en Odoo y Nexus la sigue contando por cobrar"],
    ]);
  });

  it("B10 el fondo de marketing de Insider no es venta: si el Excel lo dejara pendiente, se dice por qué", () => {
    const r = una([resumen("INV-26", "Insider", 5226, { origen: "Mercury Bank - Principal" })], [doc("INV-26", { veredicto: "NO_ES_CARTERA", accion: "INGRESO_NO_VENTA" })]);
    expect(causa(r, "NO_CUADRA")?.partidas[0]?.que).toBe("el Excel la suma y no es venta a un cliente");
  });

  /** Secure Title en la pestaña de QuickBooks, como la deja `compararLibro` (2026-09-14: tres cuotas de US$2.000). */
  const contratoSecureTitle = (seccion: DocumentoComparado["seccion"], cobros: DocumentoComparado["cobros"]) =>
    doc("Asiento contable de Recaudo QBs#9", {
      seccion,
      numero: null,
      cliente: "Secure Title",
      total: 6000,
      veredicto: "SIN_FACTURA",
      atadura: null,
      cuenta: cuenta("Secure Title Latin America"),
      cobros,
    });

  it("B11 Secure Title marcado facturado en Nexus se descuenta del contrato, no aparece como contradicción", () => {
    // ⚠ Antes: «sin factura» seguía en US$6.000 y «Nexus y el Excel dicen otra cosa» sumaba −US$4.000 con
    // «su resumen no la suma», que es falso. Marcarlo facturado, lo que pide la pantalla, no cerraba nada.
    const r = una(
      [resumen("QBS-7", "Secure Title", 6000, { origen: "Odoo - QBs" })],
      [contratoSecureTitle("NO_INSCRITOS", [cuota("st1", "POR_COBRAR", 2000), cuota("st2", "POR_COBRAR", 2000), cuota("st3", "PROGRAMADO", 2000, null)])],
      [nexus("st1", "Secure Title Latin America", 2000), nexus("st2", "Secure Title Latin America", 2000)],
    );
    expect(r.diferencia).toBe(2000);
    expect(r.causas.map((c) => [c.causa, c.monto])).toEqual([["SIN_FACTURA", 2000]]);
  });

  it("B12 el mismo contrato pagado según el Excel y por cobrar en Nexus sí es una contradicción", () => {
    const r = una(
      [resumen("QBS-7", "Secure Title", 0, { origen: "Odoo - QBs", total: 6000 })],
      [contratoSecureTitle("QUICKBOOKS", [cuota("st1", "POR_COBRAR", 2000)])],
      [nexus("st1", "Secure Title Latin America", 2000)],
    );
    expect(causa(r, "SIN_FACTURA")).toBeUndefined();
    expect(causa(r, "NO_CUADRA")?.partidas).toEqual([
      { cliente: "Secure Title Latin America", numero: null, monto: -2000, que: "pagado según el Excel y por cobrar en Nexus" },
    ]);
  });
});

// ── C ───────────────────────────────────────────────────────────────────────────

describe("C · los emparejados que la comparación deja sueltos", () => {
  it("C1 Iberorutas FAC/2026/0328: la factura contra las cuotas sin número de la MISMA cuenta, no dos veces", () => {
    const r = enLaCalleContraExcel({
      filas: [resumen("FAC/2026/0328", "Iberorutas", 8023)],
      documentos: [doc("FAC/2026/0328", { cuenta: cuenta("Iberorutas"), total: 8023, neto: 7100, veredicto: "FALTA_EN_NEXUS", atadura: null })],
      porCobrar: [nexus("i1", "Iberorutas", 3550), nexus("i2", "Iberorutas", 3550), nexus("i3", "Iberorutas", 150)],
      hoyISO: HOY,
    }).USD!;
    // Antes: US$8.023 como «falta cargar» y −US$7.250 como «el Excel no la tiene».
    expect(causa(r, "FALTA_CARGAR")).toBeUndefined();
    expect(causa(r, "IVA")?.monto).toBe(923);
    expect(causa(r, "NO_CUADRA")?.partidas).toEqual([
      { cliente: "Iberorutas", numero: "FAC/2026/0328", monto: -150, que: "el Excel no suma lo mismo que las 3 cuotas sin número de Nexus" },
    ]);
  });

  it("C2 la única cuota del mes con otro monto NO es la factura: Iberorutas 0328 no se ata a la cuota de US$150", () => {
    const r = enLaCalleContraExcel({
      filas: [resumen("FAC/2026/0328", "Iberorutas", 8023)],
      documentos: [doc("FAC/2026/0328", { cuenta: cuenta("Iberorutas"), total: 8023, neto: 7100, atadura: "MES_UNICO", cobros: [cuota("i3", "POR_COBRAR", 150)] })],
      porCobrar: [nexus("i1", "Iberorutas", 3550), nexus("i2", "Iberorutas", 3550), nexus("i3", "Iberorutas", 150)],
      hoyISO: HOY,
    }).USD!;
    expect(causa(r, "IVA")?.monto).toBe(923);
    // ⚠ Con las tres cuotas del caso real. Atada a la de US$150, salían US$6.950 «el monto no es el mismo» y las dos
    // de US$3.550 como «el Excel no la tiene»: la misma plata, con dos historias falsas.
    expect(causa(r, "NO_CUADRA")?.partidas).toEqual([
      { cliente: "Iberorutas", numero: "FAC/2026/0328", monto: -150, que: "el Excel no suma lo mismo que las 3 cuotas sin número de Nexus" },
    ]);
  });

  it("C3 INV-57 y la cuota de Teamnet: misma plata con días de diferencia es una pista, vale cero y queda en «sin cuenta»", () => {
    const r = enLaCalleContraExcel({
      filas: [resumen("INV-57", "SOLUCIONES, ANALITICOS Y SERVICIOS TEAM", 2000), resumen("INVOICE-1", "INTERCERT LATAM SAC", 1000)],
      documentos: [
        doc("INV-57", { cliente: "SOLUCIONES, ANALITICOS Y SERVICIOS TEAM", fechaFactura: "2026-09-01", veredicto: "SIN_CUENTA" }),
        doc("INVOICE-1", { cliente: "INTERCERT LATAM SAC", fechaFactura: "2026-09-01", veredicto: "SIN_CUENTA" }),
      ],
      // Una cuota de mil de otra cuenta, pero emitida dos meses antes: no es la de Intercert.
      porCobrar: [nexus("t1", "Teamnet", 2000, { fechaEmision: "2026-09-05" }), nexus("x", "Otra", 1000, { fechaEmision: "2026-07-01" })],
      hoyISO: HOY,
    }).USD!;
    expect(causa(r, "SIN_CUENTA")).toMatchObject({ monto: 1000 });
    expect(causa(r, "SIN_CUENTA")!.partidas.map((p) => [p.numero, p.monto])).toEqual([
      ["INVOICE-1", 1000],
      ["INV-57", 0],
    ]);
    expect(causa(r, "SIN_CUENTA")!.partidas[1]!.que).toContain("Teamnet");
    expect(causa(r, "NO_CUADRA")?.partidas).toEqual([{ cliente: "Otra", numero: null, monto: -1000, que: "por cobrar en Nexus y el Excel no la tiene" }]);
  });

  it("C4 Librería Internacional: la factura en una cuenta y la cuota en otra, guardada con IVA", () => {
    const r = enLaCalleContraExcel({
      filas: [resumen("FAC/2026/0346", "Librería Internacional", 2655.5)],
      documentos: [doc("FAC/2026/0346", { cuenta: cuenta("Librería Internacional"), total: 2655.5, neto: 2350, veredicto: "FALTA_EN_NEXUS", atadura: null })],
      porCobrar: [nexus("lib", "Librería Internacional (Desarrollos Culturales Costa Rica)", 2655.5)],
      hoyISO: HOY,
    }).USD!;
    expect(r.diferencia).toBe(0);
    expect(causa(r, "IVA")?.monto).toBe(305.5);
    expect(causa(r, "NO_CUADRA")?.partidas[0]).toMatchObject({
      monto: -305.5,
      que: "la factura está en «Librería Internacional» y la cuota en «Librería Internacional (Desarrollos Culturales Costa Rica)»",
    });
  });

  it("C5 un cobro atado a dos documentos se resta una sola vez", () => {
    const r = enLaCalleContraExcel({
      filas: [resumen("A", "Uno", 100), resumen("B", "Uno", 100)],
      documentos: [doc("A", { cuenta: cuenta("Uno"), cobros: [cuota("c")] }), doc("B", { cuenta: cuenta("Uno"), cobros: [cuota("c")] })],
      porCobrar: [nexus("c", "Uno", 100)],
      hoyISO: HOY,
    }).USD!;
    expect(r.diferencia).toBe(100);
    expect(r.causas.reduce((s, c) => s + c.monto, 0)).toBe(100);
    expect(causa(r, "NO_CUADRA")?.partidas[0]?.que).toBe("la cuota de Nexus ya está contada con otra factura del Excel");
  });
});

// ── D ───────────────────────────────────────────────────────────────────────────

describe("D · el invariante: las causas suman la diferencia, en cada moneda", () => {
  it("D1 con todos los casos juntos, en dólares y colones, no queda un centavo sin causa", () => {
    const r = enLaCalleContraExcel({
      filas: [
        resumen("FAC/2026/0330", "JUDESUR", 796_156.19, { moneda: "CRC" }),
        resumen("FAC/2026/0343", "MCCANN", 13_041_612.44, { moneda: "CRC" }),
        resumen("QBS-8", "Secure Title", 6000, { origen: "Odoo - QBs" }),
        resumen("FAC/2026/0308", "PUBLIMARK", 15_226.75),
        resumen("FAC/2026/0328", "Iberorutas", 8023),
        resumen("INV-15", "Construtecho", 7390, { origen: "Mercury Bank - Principal" }),
        resumen("INV-38", "Multiquimica", 3400),
        resumen("FAC/2026/0323", "Global Supply", 0),
        resumen("INV-55", "Multiquimica", 1627),
        resumen("FAC/2026/0336", "Ecoquintas", 3593.4),
      ],
      documentos: [
        doc("FAC/2026/0330", { cuenta: cuenta("JUDESUR"), total: 796_156.19, neto: 704_563, cobros: [cuota("jud")] }),
        doc("FAC/2026/0343", { veredicto: "SIN_CUENTA" }),
        doc("FAC/2026/0308", { veredicto: "SIN_CUENTA" }),
        doc("FAC/2026/0328", { cuenta: cuenta("Iberorutas"), total: 8023, neto: 7100, atadura: null }),
        doc("INV-15", { cuenta: cuenta("Construtecho"), atadura: null }),
        doc("INV-38", { cuenta: cuenta("Multiquimica"), cobros: [cuota("mq38", "COBRADO")] }),
        doc("FAC/2026/0323", { cuenta: cuenta("Global Supply"), cobros: [cuota("gs")] }),
        doc("INV-55", { cuenta: cuenta("Multiquimica"), atadura: null }),
        doc("FAC/2026/0336", { cuenta: cuenta("Ecoquintas"), total: 3593.4, neto: 3180, cobros: [cuota("eco")] }),
      ],
      porCobrar: [
        nexus("jud", "JUDESUR", 704_563, { moneda: "CRC" }),
        nexus("i1", "Iberorutas", 3550),
        nexus("i2", "Iberorutas", 3550),
        nexus("i3", "Iberorutas", 150),
        ...[4560, 2280, 550, 550].map((m, k) => nexus(`ct${k}`, "Construtecho", m)),
        nexus("gs", "Global Supply", 3396),
        nexus("mq55", "Multiquimica", 1626.67),
        nexus("eco", "Ecoquintas", 3180),
        nexus("otra", "Grupo Servica", 510),
      ],
      hoyISO: HOY,
    });
    for (const m of Object.values(r)) {
      const suma = m.causas.reduce((s, c) => s + Math.round(c.monto * 100), 0);
      expect(suma, m.moneda).toBe(Math.round(m.diferencia * 100));
      for (const c of m.causas) {
        expect(Math.round(c.partidas.reduce((s, p) => s + p.monto * 100, 0)), `${m.moneda} ${c.causa}`).toBe(Math.round(c.monto * 100));
      }
    }
    expect(r.USD).toMatchObject({ excel: 45_260.15, nexus: 23_902.67, diferencia: 21_357.48 });
    expect(r.CRC).toMatchObject({ excel: 13_837_768.63, nexus: 704_563 });
  });
});

// ── E ───────────────────────────────────────────────────────────────────────────

describe("E · rendimientoPorMoneda — la tarjeta por moneda", () => {
  /** La cobranza del reporte en producción, 2026-09-14. */
  const usd: CobranzaDeMoneda = {
    facturado: 249_881.15,
    cobrado: 199_112.32,
    porCobrar: 50_768.83,
    vencido: 33_870,
    sobreFacturado: 0.797,
    sobreExigible: 0.855,
    enPlazo: 16_898.83,
  };
  const crc: CobranzaDeMoneda = {
    facturado: 704_563,
    cobrado: 0,
    porCobrar: 704_563,
    vencido: 704_563,
    sobreFacturado: 0,
    sobreExigible: 0,
    enPlazo: 0,
  };

  it("E1 EL CASO REAL: dólares primero, cada moneda en la suya, y los dos % suman 100", () => {
    const [d, c] = rendimientoPorMoneda({ cobranza: { CRC: crc, USD: usd }, deAniosAnteriores: {}, excel: { estado: "SIN_EXCEL" } });
    expect(d).toEqual({
      moneda: "USD",
      facturado: 249_881.15,
      cobrado: 199_112.32,
      enLaCalle: 50_768.83,
      vencido: 33_870,
      enPlazo: 16_898.83,
      pctCobrado: 0.797,
      pctEnLaCalle: 0.203,
      pctSinLoEnPlazo: 0.855,
      deAniosAnteriores: null,
      excel: null,
    });
    expect(c).toMatchObject({ moneda: "CRC", enLaCalle: 704_563, pctCobrado: 0, pctEnLaCalle: 1, excel: null });
  });

  it("E2 con el Excel, cada moneda lleva su comparación; una moneda que solo tiene el Excel aparece igual", () => {
    const excelUsd: EnLaCalleContraExcel = { moneda: "USD", excel: 121_325.27, nexus: 50_768.83, diferencia: 70_556.44, causas: [] };
    const excelEur: EnLaCalleContraExcel = { moneda: "EUR", excel: 10, nexus: 0, diferencia: 10, causas: [] };
    const filas = rendimientoPorMoneda({
      cobranza: { USD: usd },
      deAniosAnteriores: {},
      excel: { estado: "OK", subidoEl: "2026-09-13", archivo: "x.xlsx", filasIlegibles: 0, porMoneda: { USD: excelUsd, EUR: excelEur } },
    });
    expect(filas.map((f) => f.moneda)).toEqual(["USD", "EUR"]);
    expect(filas[0]!.excel?.diferencia).toBe(70_556.44);
    expect(filas[1]).toMatchObject({ facturado: 0, pctCobrado: null, pctEnLaCalle: null, excel: { excel: 10 } });
  });

  it("E3 lo de años anteriores va aparte y solo si hay plata", () => {
    const filas = rendimientoPorMoneda({
      cobranza: { USD: usd },
      deAniosAnteriores: { USD: { porCobrar: 2975, vencido: 2975, facturas: 1 }, CRC: { porCobrar: 0, vencido: 0, facturas: 0 } },
      excel: { estado: "ERROR", mensaje: "x" },
    });
    expect(filas.map((f) => f.moneda)).toEqual(["USD"]);
    expect(filas[0]!.deAniosAnteriores).toEqual({ porCobrar: 2975, vencido: 2975, facturas: 1 });
    expect(filas[0]!.enLaCalle).toBe(50_768.83);
  });
});
