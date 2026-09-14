/**
 * lib/cobranza/libro-alex.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/libro-alex.test.ts --project unit`.
 *
 * Los casos 1 a 7 son las reglas del plan (etapa 11). Los clientes, montos y firmas son los medidos el
 * 2026-09-12 contra el libro real y la base (solo lectura): Global Supply, IIA, Seléctrica, ALMOTEC,
 * Bluesat, Multiquímica, Ecoquintas, Atlas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FilaLibro } from "./libro-alex-lectura";
import { compararLibro, documentosDelLibroPorCobro, subconjuntoUnico, type ContextoLibro, type PropuestaDelLibro } from "./libro-alex";
import { cobroDeNexus, facturaDelEspejo, filaDelLibro } from "./__fixtures__/libro-alex";

/* ── Armado ─────────────────────────────────────────────────────────────────────── */

const IMPORT = "import:facturaciones-2026";
const ODOO = "Asiento Contable por Mes ODOO";
const MERCURY = "Asientos Contables Mercury Bank";

const ctx: ContextoLibro = {
  cuentas: [
    { cuentaId: "iia", nombre: "IIA", razonSocial: null, cedulaJuridica: "3101543051", tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "gs", nombre: "Global Supply S.A", razonSocial: null, cedulaJuridica: "3101362598", tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "almotec", nombre: "ALMOTEC", razonSocial: "Corporación Almotec S.A", cedulaJuridica: "3-101-105018", tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "bluesat", nombre: "BLUESAT", razonSocial: null, cedulaJuridica: "3101641911", tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "multiquimica", nombre: "Multiquimica", razonSocial: "Multiquimica", cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
    { cuentaId: "teamnet", nombre: "Teamnet", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "ODOO" },
    { cuentaId: "insider", nombre: "Insider Digital", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
    { cuentaId: "ecoquintas", nombre: "Ecoquintas", razonSocial: null, cedulaJuridica: "3101539521", tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "amc", nombre: "AMC - Atlas Mining & Construction", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "ODOO" },
    { cuentaId: "acccsa", nombre: "ACCCSA", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "kaizen", nombre: "KAIZEN KAPITAL", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "ODOO" },
  ],
  vinculos: [
    { odooPartnerId: 1, odooPartnerNombre: "ILEANA AGUILAR INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA", cuentaId: "iia", ignorado: false },
    { odooPartnerId: 2, odooPartnerNombre: "GLOBAL SUPPLY SOCIEDAD ANONIMA", cuentaId: "gs", ignorado: false },
    { odooPartnerId: 3, odooPartnerNombre: "CORPORACION ALMOTEC SOCIEDAD ANONIMA", cuentaId: "almotec", ignorado: false },
    { odooPartnerId: 4, odooPartnerNombre: "GRUPO ECOQUINTAS SOCIEDAD ANONIMA", cuentaId: "ecoquintas", ignorado: false },
    { odooPartnerId: 9, odooPartnerNombre: "PUBLIMARK SOCIEDAD ANONIMA", cuentaId: null, ignorado: false },
  ],
  facturas: [
    facturaDelEspejo({ numero: "FAC/2026/0295", odooPartnerId: 1, montoNeto: 60, invoiceDate: "2026-06-10" }),
    facturaDelEspejo({ numero: "FAC/2026/0206", odooPartnerId: 2, montoNeto: 1867, invoiceDate: "2026-02-04" }),
    facturaDelEspejo({ numero: "FAC/2026/0329", odooPartnerId: 3, montoNeto: 6900, invoiceDate: "2026-08-19" }),
    facturaDelEspejo({ numero: "FAC/2026/0209", odooPartnerId: 9, montoNeto: 13475, invoiceDate: "2026-02-12" }),
    facturaDelEspejo({ numero: "FAC/2026/0300", odooPartnerId: 2, montoNeto: 1848, invoiceDate: "2026-06-15", paymentState: "reversed" }),
    /* Ecoquintas ya facturó con IVA: sus facturas de junio y septiembre, que el espejo no trae, van ÷ 1,13. */
    facturaDelEspejo({ numero: "FAC/2026/0271", odooPartnerId: 4, montoNeto: 3180, invoiceDate: "2026-04-22" }),
  ],
  cobros: [
    cobroDeNexus({ id: "iia-may", cuentaId: "iia", periodo: "2026-05", monto: 60, estado: "COBRADO", confirmadoPor: IMPORT, fechaEmision: "2026-05-30" }),
    cobroDeNexus({ id: "iia-jun", cuentaId: "iia", periodo: "2026-06", monto: 60, estado: "COBRADO", confirmadoPor: IMPORT, fechaEmision: "2026-06-30" }),
    cobroDeNexus({ id: "gs-feb", cuentaId: "gs", periodo: "2026-02", monto: 1867, estado: "COBRADO", confirmadoPor: IMPORT, fechaEmision: "2026-02-15" }),
    ...["06", "07", "08"].map((m, i) =>
      cobroDeNexus({ id: `almotec-${m}`, cuentaId: "almotec", periodo: `2026-${m}`, monto: 2300, fechaEmision: "2026-08-19", numCuota: i + 1 }),
    ),
    ...["06", "07", "08", "09", "10", "11"].flatMap((m, i) => [
      cobroDeNexus({ id: `wk-${m}`, cuentaId: "bluesat", servicioId: "wk", servicio: "Bluesat Welcome kit", periodo: `2026-${m}`, monto: 250, numCuota: i + 1 }),
      cobroDeNexus({ id: `sn-${m}`, cuentaId: "bluesat", servicioId: "sn", servicio: "Bluesat - SignNow", periodo: `2026-${m}`, monto: 700, numCuota: i + 1 }),
    ]),
    cobroDeNexus({ id: "mq-ago", cuentaId: "multiquimica", periodo: "2026-08", monto: 3400, estado: "COBRADO", confirmadoPor: "aarrieta@smarteamcr.com", fechaEmision: "2026-08-19" }),
    cobroDeNexus({ id: "insider-jun", cuentaId: "insider", periodo: "2026-06", monto: 5226, fechaEmision: "2026-06-05" }),
    cobroDeNexus({ id: "eco-jun-a", cuentaId: "ecoquintas", servicioId: "eco-a", periodo: "2026-06", monto: 1880, estado: "POR_COBRAR", fechaEmision: "2026-09-03" }),
    cobroDeNexus({ id: "eco-jun-b", cuentaId: "ecoquintas", servicioId: "eco-b", periodo: "2026-06", monto: 1300, estado: "POR_COBRAR", fechaEmision: "2026-09-03" }),
    cobroDeNexus({ id: "amc-ago", cuentaId: "amc", periodo: "2026-08", monto: 2450, estado: "POR_COBRAR", fechaEmision: "2026-08-19" }),
    cobroDeNexus({ id: "acccsa-ene", cuentaId: "acccsa", periodo: "2026-01", monto: 712, estado: "COBRADO", confirmadoPor: IMPORT, fechaEmision: "2026-01-15" }),
    cobroDeNexus({ id: "acccsa-feb", cuentaId: "acccsa", periodo: "2026-02", monto: 100, estado: "COBRADO", confirmadoPor: IMPORT, fechaEmision: "2026-02-15" }),
    ...Array.from({ length: 9 }, (_, i) =>
      cobroDeNexus({ id: `kaizen-${i + 1}`, cuentaId: "kaizen", periodo: `2026-${String(9 + (i % 4)).padStart(2, "0")}`, monto: 2000, numCuota: i + 1 }),
    ),
    cobroDeNexus({ id: "kaizen-10", cuentaId: "kaizen", periodo: "2027-06", monto: 200, numCuota: 10 }),
  ],
  aliados: ["HubSpot", "Atom Chat", "Cooby"],
};

const libro: FilaLibro[] = [
  filaDelLibro({ hoja: MERCURY, fila: 12, seccion: "MERCURY", numero: "INV-11", cliente: "Atom Chat INC", total: 2796.75, estado: "PAGADO", periodo: "2026-02", fechaFactura: "2026-02-04" }),
  filaDelLibro({ hoja: MERCURY, fila: 41, seccion: "MERCURY", numero: "INV-26", cliente: "INSIDER DIGITAL SOCIEDAD ANONIMA DE CAPITAL VARIABLE / IDI220418NB4", total: 5226, estado: "PAGADO", periodo: "2026-06", fechaFactura: "2026-06-05" }),
  filaDelLibro({ hoja: MERCURY, fila: 68, seccion: "MERCURY", numero: "INV-38", cliente: "Multiquimica Dominicana, S.A I 1-01-10772-3", total: 3400, estado: "SIN_PAGAR", periodo: "2026-08", fechaFactura: "2026-08-21", color: "VENCIDA" }),
  filaDelLibro({ hoja: MERCURY, fila: 64, seccion: "MERCURY", numero: "INV-47", cliente: "Atlas Mining & Construction, S.A. I 7208610-6", total: 7350, estado: "PAGADO", periodo: "2026-08", fechaFactura: "2026-08-10" }),
  filaDelLibro({ hoja: MERCURY, fila: 67, seccion: "MERCURY", numero: "INV-50", cliente: "Atlas Mining & Construction, S.A. I 7208610-6", total: 2450, estado: "SIN_PAGAR", periodo: "2026-08", fechaFactura: "2026-08-19" }),
  filaDelLibro({ hoja: MERCURY, fila: 2, seccion: "MERCURY", numero: "INV-4-1", cliente: "ACCCSA International S.A.", total: 712.5, estado: "PAGADO", periodo: "2026-01", fechaFactura: "2026-01-02" }),
  filaDelLibro({ hoja: MERCURY, fila: 10, seccion: "MERCURY", numero: "INV-4-2", cliente: "ACCCSA International S.A.", total: 113, estado: "PAGADO", periodo: "2026-02", fechaFactura: "2026-02-02" }),
  filaDelLibro({ hoja: "Asiento contable de Recaudo No", fila: 8, seccion: "NO_INSCRITOS", cliente: "Teamnet Web", proyecto: "Web Propuesta", total: 4000, pendiente: 1000 }),
  filaDelLibro({ hoja: ODOO, fila: 14, seccion: "ODOO", numero: "FAC/2026/0206", cliente: "GLOBAL SUPPLY SOCIEDAD ANONIMA", total: 2109.71, estado: "SIN_PAGAR", periodo: "2026-02", fechaFactura: "2026-02-04", color: "VENCIDA" }),
  filaDelLibro({ hoja: ODOO, fila: 59, seccion: "ODOO", numero: "FAC/2026/0278", cliente: "ILEANA AGUILAR INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA", total: 67.8, estado: "PAGADO", periodo: "2026-05", fechaFactura: "2026-05-05" }),
  filaDelLibro({ hoja: ODOO, fila: 74, seccion: "ODOO", numero: "FAC/2026/0295", cliente: "ILEANA AGUILAR INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA", total: 67.8, estado: "SIN_PAGAR", periodo: "2026-06", fechaFactura: "2026-06-10", color: "VENCIDA" }),
  filaDelLibro({ hoja: ODOO, fila: 73, seccion: "ODOO", numero: "FAC/2026/0292", cliente: "GRUPO ECOQUINTAS SOCIEDAD ANONIMA", total: 3593.4, estado: "PAGADO", periodo: "2026-06", fechaFactura: "2026-06-08" }),
  filaDelLibro({ hoja: ODOO, fila: 108, seccion: "ODOO", numero: "FAC/2026/0329", cliente: "CORPORACION ALMOTEC SOCIEDAD ANONIMA", total: 7797, estado: "SIN_PAGAR", periodo: "2026-08", fechaFactura: "2026-08-19", color: "VENCIDA" }),
  filaDelLibro({ hoja: ODOO, fila: 116, seccion: "ODOO", numero: "FAC/2026/0336", cliente: "GRUPO ECOQUINTAS SOCIEDAD ANONIMA", total: 3593.4, estado: "SIN_PAGAR", periodo: "2026-09", fechaFactura: "2026-09-03", color: "VENCIDA" }),
  filaDelLibro({ hoja: ODOO, fila: 16, seccion: "ODOO", numero: "FAC/2026/0209", cliente: "PUBLIMARK SOCIEDAD ANONIMA", total: 15226.75, estado: "PAGADO", periodo: "2026-02", fechaFactura: "2026-02-12" }),
  filaDelLibro({ hoja: "Hoja 9", fila: 5, seccion: "ODOO", numero: "FAC/2026/0295", cliente: "ILEANA AGUILAR INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA", total: 67.8, estado: "SIN_PAGAR", periodo: "2026-06", fechaFactura: "2026-06-10", color: "EN_GRACIA" }),
  filaDelLibro({ hoja: "Asiento contable de Recaudo QBs", fila: 10, seccion: "NO_INSCRITOS", cliente: "Bluesat", proyecto: "Welcome Kit + SignNow", total: 5700, pendiente: 3800 }),
  filaDelLibro({ hoja: "Asiento contable de Recaudo QBs", fila: 18, seccion: "PLAN_DE_PAGO", cliente: "Kaizen Kapital", proyecto: "Sitio Web", total: 18200, pendiente: 2000 }),
  filaDelLibro({ hoja: "Compendio de Facturación Genera", fila: 80, seccion: "COMPENDIO", numero: "FAC/2026/0300", cliente: "GLOBAL SUPPLY SOCIEDAD ANONIMA", total: 2088.24, pendiente: 0, origen: "Odoo - Principal" }),
  filaDelLibro({ hoja: "Compendio de Facturación Genera", fila: 10, seccion: "COMPENDIO", numero: "NOINS-1", cliente: "Areya", total: 10900, pendiente: 0, origen: "Mercury Bank - No Inscritos" }),
];

const { filas, conteo } = compararLibro(libro, ctx);
const de = (clave: string): PropuestaDelLibro => {
  const p = filas.find((x) => x.clave === clave || x.cliente === clave);
  if (!p) throw new Error(`No hay propuesta para ${clave}`);
  return p;
};

/* ── Los casos del plan ─────────────────────────────────────────────────────────── */

describe("1 · una propuesta por documento, y ninguna escribe COBRADO", () => {
  it("el mismo número en dos pestañas es UNA propuesta, con las dos fuentes y el aviso de que no la pintan igual", () => {
    expect(filas.filter((p) => p.numero === "FAC/2026/0295")).toHaveLength(1);
    const iia = de("FAC/2026/0295");
    expect(iia.fuentes.map((f) => f.hoja)).toEqual([ODOO, "Hoja 9"]);
    expect(iia.avisos.join(" ")).toMatch(/no la pintan igual/);
  });

  it("el Compendio no duplica lo que traen las otras pestañas ni las filas con número inventado", () => {
    expect(filas.some((p) => p.numero === "NOINS-1")).toBe(false);
    expect(filas.length).toBe(Object.values(conteo).reduce((a, b) => a + b, 0));
  });

  it("⛔ lo pagado según el libro con Nexus sin cobrar es «revisá el pago», nunca un cambio de estado", () => {
    const ecoPagada = filas.filter((p) => p.estadoLibro === "PAGADO" && p.cobros.some((c) => c.estado !== "COBRADO"));
    for (const p of ecoPagada) {
      expect(p.accion).toBe("REVISAR_PAGO");
      expect(p.propuesta).toMatch(/Nexus no la pasa a Cobrado/);
    }
  });
});

describe("2 · ⛔ «pagado» de No inscritos nunca se propone como cobrado", () => {
  it("Teamnet Web: 3.000 «pagados» son total menos adeudado, y la propuesta es cargar el plan", () => {
    const t = de("Teamnet Web");
    expect(t.pagadoSegunLibro).toBe(3000);
    expect(t.accion).toBe("CARGAR_PLAN");
    expect(t.accion).not.toBe("REVISAR_PAGO");
    expect(t.avisos.join(" ")).toMatch(/no se propone como cobrado/);
  });

  it("Bluesat, ya cargado, queda programado hasta confirmar la factura", () => {
    const b = de("Bluesat");
    expect(b).toMatchObject({ veredicto: "SIN_FACTURA", accion: "NINGUNA" });
    expect(b.propuesta).toMatch(/programado hasta confirmar que hay factura/);
  });
});

describe("3 · usa «Total en moneda», no el pendiente", () => {
  it("Global Supply: el total es 2.109,71 USD y el neto del espejo 1.867, que es el cobro de febrero", () => {
    const gs = de("FAC/2026/0206");
    expect(gs).toMatchObject({ total: 2109.71, neto: 1867, netoFuente: "ESPEJO", moneda: "USD" });
    expect(gs.cobros.map((c) => c.id)).toEqual(["gs-feb"]);
  });
});

describe("4 · Atom Chat e INV-26/27 no son cartera", () => {
  it("Atom Chat es aliado: comisión de aliado", () => {
    expect(de("INV-11")).toMatchObject({ veredicto: "NO_ES_CARTERA", accion: "COMISION_DE_ALIADO" });
  });

  it("el fondo de marketing de Insider va a Ingresos variables, aunque haya un cobro que coincide", () => {
    const insider = de("INV-26");
    expect(insider).toMatchObject({ veredicto: "NO_ES_CARTERA", accion: "INGRESO_NO_VENTA", cobros: [] });
    expect(insider.propuesta).toMatch(/Ingresos variables/);
  });
});

describe("5 · el neto: del espejo; ÷1,13 solo si la cuenta es nacional y ya facturó con IVA; si no, vacío", () => {
  it("del espejo", () => {
    expect(de("FAC/2026/0295")).toMatchObject({ neto: 60, netoFuente: "ESPEJO" });
  });

  it("una factura de Odoo que el espejo no trae, de una cuenta nacional con IVA: total ÷ 1,13", () => {
    expect(de("FAC/2026/0278")).toMatchObject({ neto: 60, netoFuente: "IVA_13", veredicto: "COINCIDE" });
  });

  it("una cuenta nacional sin facturas con IVA en el espejo, o una de Mercury: vacío", () => {
    expect(de("INV-38")).toMatchObject({ neto: null, netoFuente: null });
  });

  it("«confirmar IVA» solo cuando la diferencia es justo el 13 %", () => {
    expect(de("INV-4-2")).toMatchObject({ accion: "CONFIRMAR_IVA", veredicto: "REVISAR" });
    const distinto = de("INV-4-1");
    expect(distinto.accion).not.toBe("CONFIRMAR_IVA");
    expect(distinto.diferencias.join(" ")).toMatch(/Monto: el libro dice US\$712,50 y Nexus tiene US\$712/);
  });
});

describe("6 · una fila puede atar varios servicios o varias cuotas", () => {
  it("Bluesat 950 = 250 + 700: la fila ata los dos servicios y sus doce cuotas", () => {
    const b = de("Bluesat");
    expect(b.desglose).toEqual([250, 700]);
    expect(b.cobros).toHaveLength(12);
  });

  it("ALMOTEC: una factura de 6.900 neto para las tres cuotas de 2.300 facturadas el mismo día", () => {
    const a = de("FAC/2026/0329");
    expect(a.cobros.map((c) => c.id).sort()).toEqual(["almotec-06", "almotec-07", "almotec-08"]);
    expect(a.veredicto).toBe("COINCIDE");
  });

  it("⚠ el reparto va por señal: la de septiembre se lleva las cuotas facturadas el 3-sep, no la de junio por el mes", () => {
    expect(de("FAC/2026/0336").cobros.map((c) => c.id).sort()).toEqual(["eco-jun-a", "eco-jun-b"]);
    expect(de("FAC/2026/0292").veredicto).toBe("FALTA_EN_NEXUS");
  });

  it("⚠ la única cuota del mes no se la lleva la factura que no coincide: INV-50 es la de 2.450", () => {
    expect(de("INV-50").cobros.map((c) => c.id)).toEqual(["amc-ago"]);
    expect(de("INV-47").veredicto).toBe("FALTA_EN_NEXUS");
  });

  it("dos combinaciones posibles no se atan", () => {
    expect(subconjuntoUnico([2300, 2300, 2300], (n) => n * 100, 460000, 2, 3)).toBe("varios");
    expect(subconjuntoUnico([250, 700], (n) => n * 100, 95000, 2, 3)).toEqual([250, 700]);
  });
});

describe("7 · lo cobrado se queda cobrado, salvo las tres facturas que decidió Alex", () => {
  it.each(["FAC/2026/0206", "FAC/2026/0295"])("%s vuelve a por cobrar: «sacala de Cobrado», con la firma del import a la vista", (numero) => {
    const p = de(numero);
    expect(p).toMatchObject({ veredicto: "NO_COINCIDE", accion: "SACAR_DE_COBRADO" });
    expect(p.diferencias.join(" ")).toMatch(/import:facturaciones-2026/);
  });

  it("otro Cobrado que el libro da sin pagar se revisa, no se saca (Multiquímica, confirmado por una persona)", () => {
    const mq = de("INV-38");
    expect(mq.accion).toBe("REVISAR_COBRADO");
    expect(mq.diferencias.join(" ")).toMatch(/aarrieta@smarteamcr\.com/);
  });
});

describe("lo demás", () => {
  it("un cliente de Odoo sin emparejar: emparejar, sin atar cobros", () => {
    expect(de("FAC/2026/0209")).toMatchObject({ veredicto: "SIN_CUENTA", accion: "EMPAREJAR", cobros: [] });
  });

  it("una factura que Odoo revirtió no es cartera", () => {
    expect(de("FAC/2026/0300").veredicto).toBe("NO_ES_CARTERA");
  });

  it("un plan de pagos espera la decisión del cliente, sin tocar nada", () => {
    expect(de("Kaizen Kapital")).toMatchObject({ veredicto: "REVISAR", accion: "ESPERA_DECISION" });
  });
});

/* ── ⛔ Nada del libro escribe un cobro ─────────────────────────────────────────── */

const RAIZ = join(__dirname, "..", "..");
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fuente = (rel: string) => sinComentarios(readFileSync(join(RAIZ, rel), "utf8"));
const ESCRITURA = /\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw/g;

describe("⛔ el libro solo lee, salvo el lote que se sube", () => {
  it("los módulos puros y el lector no tocan la base", () => {
    for (const f of ["lib/cobranza/libro-alex.ts", "lib/cobranza/libro-alex-lectura.ts", "lib/cobranza/libro-alex-xlsx.ts", "lib/cobranza/sociedades.ts"]) {
      expect(fuente(f), f).not.toMatch(/@prisma\/client|from\s+["']@\/lib\/db/);
    }
  });

  it("el servidor del libro escribe una sola cosa: el lote en staging", () => {
    const escrituras = [...fuente("lib/cobranza/libro-alex-server.ts").matchAll(ESCRITURA)].map((m) => m[0]);
    expect(escrituras).toEqual([".importacionCobranza.create("]);
  });

  it("ni el servidor ni las rutas del libro pasan por el chokepoint de estado ni escriben COBRADO", () => {
    for (const f of [
      "lib/cobranza/libro-alex-server.ts",
      "app/api/cobranza/import/[importId]/libro/route.ts",
      "app/api/cobranza/import/[importId]/numeros/route.ts",
    ]) {
      const src = fuente(f);
      expect(src, f).not.toMatch(/cambiarEstadoCobro/);
      expect(src, f).not.toMatch(/estado:\s*["']COBRADO["']/);
      expect([...src.matchAll(ESCRITURA)].map((m) => m[0]).filter((e) => !e.startsWith(".importacionCobranza.")), f).toEqual([]);
    }
  });
});

describe("lo que el libro le dice a «Lo que no cuadra»", () => {
  /* Medido el 2026-09-14: ACCCSA, cinco cuotas de US$712; el libro trae INV-4-1 a INV-4-4 por US$712,50. */
  const acccsa: ContextoLibro = {
    ...ctx,
    cobros: [
      ...["01", "02"].map((m) => cobroDeNexus({ id: `acccsa-${m}`, cuentaId: "acccsa", periodo: `2026-${m}`, monto: 712, estado: "COBRADO", fechaEmision: `2026-${m}-15` })),
      cobroDeNexus({ id: "acccsa-06", cuentaId: "acccsa", periodo: "2026-06", monto: 150, estado: "POR_COBRAR", fechaEmision: "2026-06-15" }),
    ],
  };
  const filas: FilaLibro[] = [
    filaDelLibro({ hoja: MERCURY, fila: 2, seccion: "MERCURY", cliente: "ACCCSA", numero: "INV-4-1", fechaFactura: "2026-01-15", total: 712.5, estado: "PAGADO", periodo: "2026-01" }),
    filaDelLibro({ hoja: MERCURY, fila: 10, seccion: "MERCURY", cliente: "ACCCSA", numero: "INV-4-2", fechaFactura: "2026-02-15", total: 712.5, estado: "PAGADO", periodo: "2026-02" }),
    /* La única cuota del mes con otro monto no dice nada: Iberorutas 0328 caía en la cuota de US$150. */
    filaDelLibro({ hoja: MERCURY, fila: 40, seccion: "MERCURY", cliente: "ACCCSA", numero: "INV-60", fechaFactura: "2026-06-20", total: 7100, estado: "SIN_PAGAR", periodo: "2026-06" }),
  ];

  it("documentosDelLibroPorCobro: la cuota atada por el mes con un monto parecido trae su factura de Mercury; con otro monto, nada", () => {
    const docs = documentosDelLibroPorCobro(filas, acccsa);
    expect(Object.fromEntries(docs)).toEqual({
      "acccsa-01": { numero: "INV-4-1", plataforma: "MERCURY", total: 712.5, moneda: "USD", fuente: `«${MERCURY}» fila 2`, porElMes: true },
      "acccsa-02": { numero: "INV-4-2", plataforma: "MERCURY", total: 712.5, moneda: "USD", fuente: `«${MERCURY}» fila 10`, porElMes: true },
    });
  });

  it("una cuota que ya tiene número no recibe el documento del libro: su número manda", () => {
    const conNumero: ContextoLibro = { ...acccsa, cobros: acccsa.cobros.map((c) => (c.id === "acccsa-01" ? { ...c, numeroFactura: "INV-4-1" } : c)) };
    expect([...documentosDelLibroPorCobro(filas, conNumero).keys()]).toEqual(["acccsa-02"]);
  });
});
