/**
 * lib/cobranza/libro-alex-carga-completa.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/libro-alex-carga-completa.test.ts --project unit`.
 *
 * La carga completa del Excel de Alexander. Los casos son los del Excel real medidos el 2026-09-13 en solo
 * lectura: Global Supply FAC/2026/0206 (una de las tres que Alex devuelve a por cobrar), Multiquimica INV-38
 * (cobrada por una persona y sin pagar en el Excel), Real Shipping INV-9 (pagada), AMVAC 0327 (promesa del
 * 15-sep), JUDESUR 0330 (falta en Nexus), Juanva 0230 (puede ser una cuota de enero), Insider, MINEC y Kaizen.
 */
import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import type { ContextoLibro, PropuestaDelLibro } from "./libro-alex";
import type { FilaLibro } from "./libro-alex-lectura";
import { planDelLibro } from "./libro-alex-aplicar";
import { indexarContexto } from "./libro-alex";
import {
  atadoSeguro,
  cobrosAtadosConSeguridad,
  huellaDelLibro,
  ivaParaLaCarga,
  leerArgumentos,
  planDeCargaCompleta,
  posibleDuplicado,
  PREFIJO_COBRO_NUEVO,
  resumenDelPlan,
  textoDeCobradoDelExcel,
  type OpcionesDelPlan,
} from "./libro-alex-carga-completa";
import { cobroDeNexus, facturaDelEspejo, filaDelLibro } from "./__fixtures__/libro-alex";

const ALEX = "aarrieta@smarteamcr.com";
const ODOO = "Asiento Contable por Mes ODOO";
const MERCURY = "Asientos Contables Mercury Bank";

/* ── 1. Los argumentos ─────────────────────────────────────────────────────────── */

describe("leerArgumentos: sin las cuatro llaves juntas no se escribe", () => {
  const raiz = process.cwd();
  const afuera = path.join(os.tmpdir(), "respaldo-excel-alex");
  const conPermiso = { ALLOW_PROD_WRITE: "1" };

  it("por defecto es un simulacro", () => {
    const r = leerArgumentos(["Libro.xlsx"], {}, raiz);
    expect(r).toEqual({ ok: true, args: { archivo: "Libro.xlsx", aplicar: false, firma: null, respaldo: null, cobrarConFirma: null } });
  });

  it("el simulacro acepta --cobrar-con-firma para mostrar los cobrados, y sigue sin escribir", () => {
    const r = leerArgumentos(["Libro.xlsx", `--cobrar-con-firma=${ALEX}`], {}, raiz);
    expect(r.ok && r.args).toMatchObject({ aplicar: false, cobrarConFirma: ALEX });
  });

  it("con todo, aplica", () => {
    const r = leerArgumentos(["Libro.xlsx", "--apply", `--firma=${ALEX}`, `--respaldo=${afuera}`], conPermiso, raiz);
    expect(r).toEqual({ ok: true, args: { archivo: "Libro.xlsx", aplicar: true, firma: ALEX, respaldo: path.resolve(afuera), cobrarConFirma: null } });
  });

  it.each([
    [["Libro.xlsx", "--apply", `--respaldo=${afuera}`], conPermiso, /--firma/],
    [["Libro.xlsx", "--apply", `--firma=${ALEX}`], conPermiso, /--respaldo/],
    [["Libro.xlsx", "--apply", `--firma=${ALEX}`, `--respaldo=${afuera}`], {}, /ALLOW_PROD_WRITE=1/],
    [["Libro.xlsx", "--apply", `--firma=${ALEX}`, `--respaldo=${path.join(raiz, "respaldos")}`], conPermiso, /fuera del repo/],
    [["Libro.xlsx", "--aplly"], conPermiso, /No conozco «--aplly»/],
    [["Libro.xlsx", "--apply", "--firma=import:facturaciones-2026", `--respaldo=${afuera}`], conPermiso, /correo de una persona/],
    [["Libro.csv"], {}, /no es un \.xlsx/],
    [[], {}, /Falta la ruta/],
  ])("%j → no", (argv, env, error) => {
    const r = leerArgumentos(argv, env, raiz);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(error);
  });
});

/* ── 2. El plan ────────────────────────────────────────────────────────────────── */

const ctx: ContextoLibro = {
  cuentas: [
    { cuentaId: "gs", nombre: "Global Supply", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "mq", nombre: "Multiquimica", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
    { cuentaId: "rs", nombre: "Real Shipping & Trade", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
    { cuentaId: "amvac", nombre: "Amvac Latam", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "judesur", nombre: "JUDESUR", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "juanva", nombre: "Transportes Juanva", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "kaizen", nombre: "Kaizen Kapital", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
  ],
  vinculos: [
    { odooPartnerId: 1, odooPartnerNombre: "GLOBAL SUPPLY SOCIEDAD ANONIMA", cuentaId: "gs", ignorado: false },
    { odooPartnerId: 5, odooPartnerNombre: "AMVAC DE COSTA RICA SOCIEDAD DE RESPONSABILIDAD LIMITADA", cuentaId: "amvac", ignorado: false },
    { odooPartnerId: 9, odooPartnerNombre: "JUNTA DE DESARROLLO REGIONAL DE LA ZONA SUR", cuentaId: "judesur", ignorado: false },
    { odooPartnerId: 7, odooPartnerNombre: "TRANSPORTES JUANVA SOCIEDAD ANONIMA", cuentaId: "juanva", ignorado: false },
  ],
  facturas: [
    facturaDelEspejo({ numero: "FAC/2026/0206", odooPartnerId: 1, montoNeto: 1867, invoiceDate: "2026-02-10" }),
    facturaDelEspejo({ numero: "FAC/2026/0327", odooPartnerId: 5, montoNeto: 1848, invoiceDate: "2026-08-10" }),
    facturaDelEspejo({ numero: "FAC/2026/0330", odooPartnerId: 9, montoNeto: 704563, invoiceDate: "2026-08-24", moneda: "CRC" }),
    facturaDelEspejo({ numero: "FAC/2026/0230", odooPartnerId: 7, montoNeto: 500, invoiceDate: "2026-03-10", montoImpuesto: 0, paymentState: "paid" }),
  ],
  cobros: [
    cobroDeNexus({ id: "gs-feb", cuentaId: "gs", periodo: "2026-02", monto: 1867, estado: "COBRADO", confirmadoPor: "import:facturaciones-2026", fechaEmision: "2026-02-10" }),
    cobroDeNexus({ id: "mq-ago", cuentaId: "mq", periodo: "2026-08", monto: 3400, estado: "COBRADO", confirmadoPor: ALEX, fechaEmision: "2026-08-05" }),
    cobroDeNexus({ id: "rs-ene", cuentaId: "rs", periodo: "2026-01", monto: 6000, estado: "POR_COBRAR", fechaEmision: "2026-01-10" }),
    cobroDeNexus({ id: "amvac-ago", cuentaId: "amvac", periodo: "2026-08", monto: 1848, estado: "POR_COBRAR", fechaEmision: "2026-08-10", promesaPago: "2026-09-14" }),
    cobroDeNexus({ id: "juanva-ene", cuentaId: "juanva", periodo: "2026-01", monto: 500, estado: "COBRADO", confirmadoPor: "import:facturaciones-2026", fechaEmision: "2026-01-10" }),
    cobroDeNexus({ id: "kz1", cuentaId: "kaizen", periodo: "2026-09", monto: 9100 }),
    cobroDeNexus({ id: "kz2", cuentaId: "kaizen", periodo: "2026-10", monto: 9100 }),
  ],
  aliados: [],
};

const filas: FilaLibro[] = [
  filaDelLibro({ hoja: ODOO, fila: 10, seccion: "ODOO", cliente: "GLOBAL SUPPLY SOCIEDAD ANONIMA", numero: "FAC/2026/0206", fechaFactura: "2026-02-10", total: 2109.71, estado: "SIN_PAGAR", periodo: "2026-02", anotacion: "Promesa de Pago esta semana tras presentación de prueba" }),
  filaDelLibro({ hoja: MERCURY, fila: 40, seccion: "MERCURY", cliente: "Multiquimica", numero: "INV-38", fechaFactura: "2026-08-05", total: 3400, estado: "SIN_PAGAR", periodo: "2026-08" }),
  filaDelLibro({ hoja: MERCURY, fila: 5, seccion: "MERCURY", cliente: "Real Shipping & Trade", numero: "INV-9", fechaFactura: "2026-01-10", fechaPago: "2026-01-25", total: 6000, estado: "PAGADO", periodo: "2026-01" }),
  filaDelLibro({ hoja: ODOO, fila: 60, seccion: "ODOO", cliente: "AMVAC DE COSTA RICA SOCIEDAD DE RESPONSABILIDAD LIMITADA", numero: "FAC/2026/0327", fechaFactura: "2026-08-10", total: 2088.24, estado: "SIN_PAGAR", periodo: "2026-08", anotacion: "Ya está con promesa de pago para este mes 15 de setiembre" }),
  filaDelLibro({ hoja: ODOO, fila: 70, seccion: "ODOO", cliente: "JUNTA DE DESARROLLO REGIONAL DE LA ZONA SUR", numero: "FAC/2026/0330", fechaFactura: "2026-08-24", total: 796156.19, moneda: "CRC", estado: "SIN_PAGAR", periodo: "2026-08", anotacion: "Estimado de Pago 15 de Setiembre " }),
  filaDelLibro({ hoja: ODOO, fila: 30, seccion: "ODOO", cliente: "TRANSPORTES JUANVA SOCIEDAD ANONIMA", numero: "FAC/2026/0230", fechaFactura: "2026-03-10", fechaPago: "2026-03-20", total: 500, estado: "PAGADO", periodo: "2026-03" }),
  filaDelLibro({ hoja: MERCURY, fila: 50, seccion: "MERCURY", cliente: "Insider", numero: "INV-26", fechaFactura: "2026-06-01", total: 5226, estado: "PAGADO", periodo: "2026-06" }),
  filaDelLibro({ hoja: MERCURY, fila: 8, seccion: "MERCURY", cliente: "Ministerio de Economía (MINEC)", numero: "INV-10", fechaFactura: "2026-01-15", fechaPago: "2026-02-01", total: 23687.25, estado: "PAGADO", periodo: "2026-01" }),
  filaDelLibro({ hoja: "Quickbooks", fila: 30, seccion: "PLAN_DE_PAGO", cliente: "Kaizen Kapital", proyecto: "Plan de Pagos", total: 18200, estado: "SIN_PAGAR", anotacion: "Plan de Pagos" }),
];

const opciones: OpcionesDelPlan = { hoyISO: "2026-09-13", referenciaISO: "2026-09-13", firma: ALEX, cobrarConFirma: null, bitacora: [] };

describe("planDeCargaCompleta: lo que hace cada paso", () => {
  const plan = planDeCargaCompleta(filas, ctx, opciones);
  const personaDe = (numero: string | null, cliente?: string) =>
    plan.paraUnaPersona.filter((x) => (numero === null ? x.cliente === cliente : x.numero === numero)).map((x) => x.motivo);

  it("1 · devuelve a por cobrar SOLO la de Alex, con motivo y número; la cobrada por una persona queda para una persona", () => {
    expect(plan.reversiones.map((r) => [r.cobroId, r.numero])).toEqual([["gs-feb", "FAC/2026/0206"]]);
    expect(plan.reversiones[0]?.patch).toEqual({
      estado: "POR_COBRAR",
      reversion: { motivo: expect.stringContaining("tres facturas que Alex decidió devolver a por cobrar"), numeroFactura: "FAC/2026/0206" },
    });
    expect(personaDe("INV-38")).toEqual(["COBRADO_SIN_PAGAR"]);
  });

  it("2 · anota los números que dice el Excel, en la cuota atada por monto exacto", () => {
    expect(plan.numeros.map((n) => [n.cobroId, n.numero]).sort()).toEqual([
      ["amvac-ago", "FAC/2026/0327"],
      ["mq-ago", "INV-38"],
      ["rs-ene", "INV-9"],
    ]);
  });

  it("3 · carga por cobrar la factura que falta, con el neto de la copia de Odoo; no la que puede ser una cuota de enero", () => {
    expect(plan.cargas.map((c) => [c.numero, c.cuentaId, c.monto, c.moneda])).toEqual([["FAC/2026/0330", "judesur", 704563, "CRC"]]);
    expect(plan.pedido.grupos.flatMap((g) => g.facturas)).toEqual(["FAC/2026/0330"]);
    expect(personaDe("FAC/2026/0230")).toEqual(["POSIBLE_DUPLICADO"]);
    expect(plan.paraUnaPersona.find((x) => x.numero === "FAC/2026/0230")?.detalle).toContain("Transportes Juanva ya tiene una cuota sin número de enero de 2026");
  });

  it("3 · un cliente sin cuenta no se adivina, y Insider no es cartera", () => {
    expect(personaDe("INV-10")).toEqual(["SIN_CUENTA"]);
    expect(plan.noSeCarga.map((x) => x.numero)).toEqual(["INV-26"]);
  });

  it("3 · las anotaciones van a su cobro; ⛔ la del plan de pagos de Kaizen no se escribe", () => {
    expect(plan.anotaciones.map((a) => a.cobroId).sort()).toEqual(["amvac-ago", "gs-feb"]);
    expect(plan.anotaciones.some((a) => a.cuentaId === "kaizen")).toBe(false);
    expect(personaDe(null, "Kaizen Kapital")).toEqual(["ESPERA_DECISION"]);
  });

  it("4 · registra las promesas con fecha, también la de la factura que se carga en esta corrida", () => {
    expect(plan.promesas.map((p) => [p.cobroId, p.promesa, p.antes])).toEqual([
      ["amvac-ago", "2026-09-15", "2026-09-14"],
      [`${PREFIJO_COBRO_NUEVO}FAC/2026/0330`, "2026-09-15", null],
    ]);
  });

  it("5 · ⛔ sin firma de cobro, lo pagado se lista y no cambia nada", () => {
    expect(plan.pagadas.map((p) => [p.cobroId, p.fechaPago])).toEqual([["rs-ene", "2026-01-25"]]);
    expect(plan.contextoFinal.cobros.find((c) => c.id === "rs-ene")?.estado).toBe("POR_COBRAR");
    expect(plan.paraUnaPersona.some((x) => x.numero === "INV-9")).toBe(false);
  });

  it("⭐ correrlo dos veces no cambia nada la segunda", () => {
    expect(plan.sinCambios).toBe(false);
    const segunda = planDeCargaCompleta(filas, plan.contextoFinal, { ...opciones, bitacora: plan.bitacoraFinal });
    expect(segunda.sinCambios).toBe(true);
    expect([segunda.reversiones, segunda.numeros, segunda.cargas, segunda.anotaciones, segunda.promesas]).toEqual([[], [], [], [], []]);
    /* Lo que es de una persona sigue siendo de una persona. */
    expect(segunda.paraUnaPersona.map((x) => x.motivo).sort()).toEqual(plan.paraUnaPersona.map((x) => x.motivo).sort());
  });
});

describe("--cobrar-con-firma: lo pagado se registra con esa firma y la fecha del Excel", () => {
  it("con firma entra en Cobrado, y la segunda corrida ya no lo toca", () => {
    const conFirma = { ...opciones, cobrarConFirma: ALEX };
    const plan = planDeCargaCompleta(filas, ctx, conFirma);
    expect(plan.pagadas.map((p) => p.cobroId)).toEqual(["rs-ene"]);
    expect(plan.contextoFinal.cobros.find((c) => c.id === "rs-ene")).toMatchObject({ estado: "COBRADO", confirmadoPor: ALEX });
    const segunda = planDeCargaCompleta(filas, plan.contextoFinal, { ...conFirma, bitacora: plan.bitacoraFinal });
    expect(segunda.sinCambios).toBe(true);
    expect(segunda.pagadas).toEqual([]);
  });

  it("⛔ sin fecha de pago en el Excel no hay cobrado: queda para una persona", () => {
    const sinFecha = filas.map((f) => (f.numero === "INV-9" ? { ...f, fechaPago: null } : f));
    const plan = planDeCargaCompleta(sinFecha, ctx, { ...opciones, cobrarConFirma: ALEX });
    expect(plan.pagadas).toEqual([]);
    expect(plan.paraUnaPersona.find((x) => x.numero === "INV-9")?.motivo).toBe("PAGADA_SIN_FECHA");
  });

  it("la bitácora nombra la firma, la fila del Excel y la fecha de pago", () => {
    expect(textoDeCobradoDelExcel({ numero: "INV-9", fechaPago: "2026-01-25", fuente: `«${MERCURY}» fila 5` }, ALEX)).toBe(
      `${ALEX} registró este cobro como cobrado desde el Excel de Alexander («${MERCURY}» fila 5): la factura INV-9 figura pagada el 2026-01-25. El comprobante es ese Excel; si aparece el depósito, anotale su referencia.`,
    );
  });
});

/* ── 3. Las piezas ──────────────────────────────────────────────────────────────── */

describe("las piezas del plan", () => {
  it("atadoSeguro: por número o monto exacto; nunca «la única del mes» ni con el monto distinto", () => {
    const cuota = { id: "c", periodo: "2026-05", monto: 150, moneda: "USD", estado: "POR_COBRAR", confirmadoPor: null, fechaEmision: null, numeroFactura: null, servicio: "", numCuota: null };
    const base = { cobros: [cuota] };
    expect(atadoSeguro({ ...base, atadura: "FECHA_DE_EMISION", diferencias: [] })).toBe(true);
    expect(atadoSeguro({ ...base, atadura: "MES_UNICO", diferencias: [] })).toBe(false);
    expect(atadoSeguro({ ...base, atadura: "MES", diferencias: ["Monto: el libro dice US$7.100 y Nexus tiene US$150."] })).toBe(false);
    expect(atadoSeguro({ cobros: [], atadura: "NUMERO", diferencias: [] })).toBe(false);
  });

  it("ivaParaLaCarga: Mercury va sin IVA; una de Odoo que la copia no tiene lo pide", () => {
    expect(ivaParaLaCarga({ pideIva: true, ivaSugerido: null, plataforma: "MERCURY" })).toBe("SIN_IVA");
    expect(ivaParaLaCarga({ pideIva: true, ivaSugerido: null, plataforma: "ODOO" })).toBeNull();
    expect(ivaParaLaCarga({ pideIva: true, ivaSugerido: "CON_IVA", plataforma: "ODOO" })).toBe("CON_IVA");
    expect(ivaParaLaCarga({ pideIva: false, ivaSugerido: null, plataforma: "ODOO" })).toBeNull();
  });

  it("⭐ el plan de carga toma el neto de la copia de Odoo aunque el cliente no tenga cuenta (Fruitpoint 0222, exenta)", () => {
    const conFruitpoint: ContextoLibro = {
      ...ctx,
      facturas: [...ctx.facturas, facturaDelEspejo({ numero: "FAC/2026/0222", odooPartnerId: 44, odooPartnerNombre: "FRUITPOINT", montoNeto: 1110, montoImpuesto: 0, invoiceDate: "2026-02-20" })],
    };
    const fila = filaDelLibro({ hoja: ODOO, fila: 90, seccion: "ODOO", cliente: "FRUITPOINT", numero: "FAC/2026/0222", fechaFactura: "2026-02-20", total: 1110, estado: "PAGADO", periodo: "2026-02" });
    const g = planDelLibro([fila], conFruitpoint, "2026-09-13").grupos[0];
    expect(g?.facturas[0]?.neto).toBe(1110);
    expect(g?.pideIva).toBe(false);
  });

  it("posibleDuplicado: la misma factura cargada en la cuenta gemela (Librería Internacional)", () => {
    const gemelas: ContextoLibro = {
      ...ctx,
      cuentas: [
        { cuentaId: "li1", nombre: "Librería Internacional", razonSocial: "Desarrollos Culturales Costarricenses", cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
        { cuentaId: "li2", nombre: "Librería Internacional (Desarrollos Culturales Costa Rica)", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
      ],
      cobros: [cobroDeNexus({ id: "li2-sep", cuentaId: "li2", periodo: "2026-09", monto: 2655.5, estado: "POR_COBRAR", fechaEmision: "2026-09-10" })],
    };
    const motivo = posibleDuplicado(
      { numero: "FAC/2026/0346", cliente: "Librería Internacional", fechaFactura: "2026-09-10", moneda: "USD", total: 2655.5 },
      2350,
      "li1",
      indexarContexto(gemelas),
      new Set(),
    );
    expect(motivo).toContain("«Librería Internacional (Desarrollos Culturales Costa Rica)» tiene una cuota sin número");
    expect(motivo).toContain("en otra cuenta");
  });

  it("posibleDuplicado: MTS 440 contra una cuota de 420 (5 %), y Servica en la moneda equivocada", () => {
    const mts: ContextoLibro = {
      ...ctx,
      cuentas: [{ cuentaId: "mts", nombre: "MTS MULTISERVICIOS", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" }],
      vinculos: [{ odooPartnerId: 61, odooPartnerNombre: "GRUPO SERVICA", cuentaId: "mts", ignorado: false }],
      facturas: [
        facturaDelEspejo({ numero: "FAC/2026/0231", odooPartnerId: 61, montoNeto: 90, moneda: "CRC", invoiceDate: "2026-03-24" }),
        facturaDelEspejo({ numero: "FAC/2026/0268", odooPartnerId: 61, montoNeto: 90, invoiceDate: "2026-04-09" }),
      ],
      cobros: [cobroDeNexus({ id: "mts-mar", cuentaId: "mts", periodo: "2026-03", monto: 420, estado: "COBRADO", fechaEmision: "2026-03-15" })],
    };
    const idx = indexarContexto(mts);
    expect(posibleDuplicado({ numero: "FAC/2026/0217", cliente: "MTS", fechaFactura: "2026-02-23", moneda: "USD", total: 497.2 }, 440, "mts", idx, new Set())).toContain(
      "ya tiene una cuota sin número de marzo de 2026 por US$420",
    );
    expect(posibleDuplicado({ numero: "FAC/2026/0231", cliente: "SERVICA", fechaFactura: "2026-03-24", moneda: "CRC", total: 101.7 }, 90, "mts", idx, new Set())).toContain(
      "FAC/2026/0268 por el mismo importe en dólares",
    );
  });

  it("cobrosAtadosConSeguridad: la cuota atada solo por ser la única del mes sigue libre (TEC-AE)", () => {
    const cuota = (id: string) => ({
      id,
      periodo: "2026-04",
      monto: 1620,
      moneda: "USD",
      estado: "COBRADO",
      confirmadoPor: null,
      fechaEmision: null,
      numeroFactura: null,
      servicio: "",
      numCuota: null,
    });
    const propuestas: Array<Pick<PropuestaDelLibro, "atadura" | "cobros">> = [
      { atadura: "MES_UNICO", cobros: [cuota("abril")] },
      { atadura: "MES", cobros: [cuota("febrero")] },
      { atadura: null, cobros: [cuota("servicio")] },
    ];
    expect([...cobrosAtadosConSeguridad(propuestas)].sort()).toEqual(["febrero", "servicio"]);
  });

  it("huellaDelLibro: el mismo Excel da la misma huella aunque la base reordene las llaves", () => {
    const [primera] = filas;
    if (!primera) throw new Error("sin filas");
    const { hoja, ...resto } = primera;
    const reordenada: FilaLibro = { ...resto, hoja };
    expect(huellaDelLibro([reordenada])).toBe(huellaDelLibro([primera]));
    expect(huellaDelLibro([{ ...primera, total: 1 }])).not.toBe(huellaDelLibro([primera]));
  });

  it("resumenDelPlan: cada grupo con su plata por moneda, nunca sumadas", () => {
    const resumen = resumenDelPlan(planDeCargaCompleta(filas, ctx, opciones), null);
    const cargas = resumen.find((g) => g.titulo.startsWith("Facturas que Nexus no tiene"));
    expect(cargas?.montos).toEqual([{ moneda: "CRC", monto: 704563 }]);
    for (const g of resumen) expect(new Set(g.montos.map((m) => m.moneda)).size).toBe(g.montos.length);
    expect(resumen.find((g) => g.titulo.startsWith("Pagadas según el Excel"))?.titulo).toContain("no se tocan");
  });
});
