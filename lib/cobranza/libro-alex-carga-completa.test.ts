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
  textoDeFechaDelExcel,
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
  servicios: [],
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

/* ── 4. La misma venta contada dos veces ────────────────────────────────────────── */

/**
 * Medido el 2026-09-14: la primera corrida cargó cobradas Real Shipping INV-9 (US$6.000) y Alliance RH INV-46 (US$120).
 * Real Shipping ya tenía sus cuotas 1 y 2 (US$1.500 cada una, facturadas al día siguiente) y el detector no saltó porque
 * 1.500 + 1.500 no es 6.000; Alliance RH tiene «Capacitación Sales» sin cobros generados. ⛔ Nada se revierte: se avisa.
 */
describe("la misma venta contada dos veces: queda para una persona, nunca se revierte", () => {
  const DEL_LIBRO = "Facturación importada del libro de Alex (USD)";
  const base: ContextoLibro = {
    cuentas: [
      { cuentaId: "rs", nombre: "Real Shipping & Trade", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
      { cuentaId: "al", nombre: "Alliance RH", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
    ],
    vinculos: [],
    facturas: [],
    cobros: [1, 2].map((n) =>
      cobroDeNexus({ id: `rs-${n}`, cuentaId: "rs", servicioId: "impl", servicio: "Real Shipping", periodo: "2026-07", monto: 1500, estado: "COBRADO", confirmadoPor: ALEX, fechaEmision: "2026-01-16", numCuota: n }),
    ),
    aliados: [],
    servicios: [{ id: "cap", cuentaId: "al", descripcion: "Capacitación Sales", moneda: "USD", montoTotal: 240, fechaInicio: "2026-08-15", activo: true, cobros: 0 }],
  };
  const filasVenta: FilaLibro[] = [
    filaDelLibro({ hoja: MERCURY, fila: 5, seccion: "MERCURY", cliente: "Real Shipping & Trade", numero: "INV-9", fechaFactura: "2026-01-15", fechaPago: "2026-01-23", total: 6000, estado: "PAGADO", periodo: "2026-01" }),
    filaDelLibro({ hoja: MERCURY, fila: 60, seccion: "MERCURY", cliente: "Alliance RH", numero: "INV-46", fechaFactura: "2026-08-07", fechaPago: "2026-08-14", total: 120, estado: "PAGADO", periodo: "2026-08" }),
  ];
  const conFirma = { ...opciones, cobrarConFirma: ALEX };

  it("antes de cargar: INV-9 e INV-46 no se cargan y quedan como posible duplicado", () => {
    const plan = planDeCargaCompleta(filasVenta, base, conFirma);
    expect(plan.cargas).toEqual([]);
    const dudas = plan.paraUnaPersona.filter((x) => x.motivo === "POSIBLE_DUPLICADO");
    expect(dudas.map((x) => x.numero).sort()).toEqual(["INV-46", "INV-9"]);
    expect(dudas.find((x) => x.numero === "INV-9")?.detalle).toContain(
      "US$1.500 facturada el 2026-01-16 (cobrada) + US$1.500 facturada el 2026-01-16 (cobrada), de «Real Shipping»: puede ser la misma venta",
    );
    expect(dudas.find((x) => x.numero === "INV-46")?.detalle).toContain("el servicio «Capacitación Sales» (US$240, arranca el 2026-08-15, todavía sin cobros)");
  });

  it("ya cargadas, como quedaron en producción: la corrida no cambia nada, las deja para una persona, y la segunda dice lo mismo", () => {
    const firma = "egonzalez@smarteamcr.com";
    const cargadas: ContextoLibro = {
      ...base,
      cobros: [
        ...base.cobros,
        cobroDeNexus({ id: "inv9", cuentaId: "rs", servicioId: "libro-rs", servicio: DEL_LIBRO, periodo: "2026-01", fechaProgramada: "2026-01-15", fechaEmision: "2026-01-15", monto: 6000, estado: "COBRADO", confirmadoPor: firma, numeroFactura: "INV-9" }),
        cobroDeNexus({ id: "inv46", cuentaId: "al", servicioId: "libro-al", servicio: DEL_LIBRO, periodo: "2026-08", fechaProgramada: "2026-08-07", fechaEmision: "2026-08-07", monto: 120, estado: "COBRADO", confirmadoPor: firma, numeroFactura: "INV-46" }),
      ],
    };
    const plan = planDeCargaCompleta(filasVenta, cargadas, conFirma);
    expect(plan.sinCambios, "⛔ no revierte nada").toBe(true);
    const dudas = plan.paraUnaPersona.filter((x) => x.motivo === "POSIBLE_DUPLICADO");
    expect(dudas.map((x) => [x.numero, x.monto, x.moneda])).toEqual([
      ["INV-9", 6000, "USD"],
      ["INV-46", 120, "USD"],
    ]);
    expect(dudas[0]?.detalle).toMatch(/^Real Shipping & Trade ya tiene cargada la factura INV-9 \(US\$6\.000, cobrada\) y, a pocos días y en otro servicio, /);
    expect(dudas[0]?.detalle).toContain("Nexus no revierte nada");
    const segunda = planDeCargaCompleta(filasVenta, plan.contextoFinal, { ...conFirma, bitacora: plan.bitacoraFinal });
    expect(segunda.sinCambios).toBe(true);
    expect(segunda.paraUnaPersona).toEqual(plan.paraUnaPersona);
  });
});

/* ── 5. Lo que la primera corrida dejó mal (2026-09-14) ─────────────────────────── */

describe("la fecha de emisión real en las tres que vuelven a por cobrar, también en las ya devueltas", () => {
  /* Global Supply FAC/2026/0206: la factura es del 4-feb; el cobro tenía la quincena, 15-feb. */
  const gsCtx = (cobro: Parameters<typeof cobroDeNexus>[0]): ContextoLibro => ({
    ...ctx,
    facturas: [facturaDelEspejo({ numero: "FAC/2026/0206", odooPartnerId: 1, montoNeto: 1867, invoiceDate: "2026-02-04" })],
    cobros: [cobroDeNexus(cobro)],
  });
  const gsFila = [
    filaDelLibro({ hoja: ODOO, fila: 14, seccion: "ODOO", cliente: "GLOBAL SUPPLY SOCIEDAD ANONIMA", numero: "FAC/2026/0206", fechaFactura: "2026-02-04", total: 2109.71, estado: "SIN_PAGAR", periodo: "2026-02" }),
  ];

  it("al devolverla, la fecha pasa a la de su factura y la segunda corrida no hace nada", () => {
    const antes = gsCtx({ id: "gs-feb", cuentaId: "gs", periodo: "2026-02", monto: 1867, estado: "COBRADO", confirmadoPor: "import:facturaciones-2026", fechaEmision: "2026-02-15" });
    const plan = planDeCargaCompleta(gsFila, antes, opciones);
    expect(plan.reversiones.map((r) => r.patch)).toEqual([
      { estado: "POR_COBRAR", fechaEmision: "2026-02-04", reversion: { motivo: expect.stringContaining("devolver a por cobrar"), numeroFactura: "FAC/2026/0206" } },
    ]);
    expect(plan.fechas).toEqual([]);
    const segunda = planDeCargaCompleta(gsFila, plan.contextoFinal, { ...opciones, bitacora: plan.bitacoraFinal });
    expect(segunda.sinCambios).toBe(true);
    expect(segunda.contextoFinal.cobros[0]).toMatchObject({ estado: "POR_COBRAR", fechaEmision: "2026-02-04" });
  });

  it("ya devuelta con la fecha de quincena (como quedó en producción): corrige solo la fecha, una vez", () => {
    const devuelta = gsCtx({ id: "gs-feb", cuentaId: "gs", periodo: "2026-02", monto: 1867, estado: "POR_COBRAR", fechaEmision: "2026-02-15", numeroFactura: "FAC/2026/0206" });
    const plan = planDeCargaCompleta(gsFila, devuelta, opciones);
    expect(plan.reversiones).toEqual([]);
    expect(plan.fechas.map((f) => [f.cobroId, f.antes, f.fecha, f.patch])).toEqual([["gs-feb", "2026-02-15", "2026-02-04", { fechaEmision: "2026-02-04" }]]);
    expect(plan.sinCambios).toBe(false);
    expect(resumenDelPlan(plan, null).find((g) => g.titulo.startsWith("Fechas de emisión"))?.montos).toEqual([{ moneda: "USD", monto: 1867 }]);
    const segunda = planDeCargaCompleta(gsFila, plan.contextoFinal, { ...opciones, bitacora: plan.bitacoraFinal });
    expect(segunda.fechas).toEqual([]);
    expect(segunda.sinCambios).toBe(true);
  });

  it("⛔ una factura que no es de las tres de Alex no recibe la corrección de fecha", () => {
    const otra = gsCtx({ id: "gs-feb", cuentaId: "gs", periodo: "2026-02", monto: 1867, estado: "POR_COBRAR", fechaEmision: "2026-02-15", numeroFactura: "FAC/2026/0206" });
    const filaOtra = [
      filaDelLibro({ hoja: ODOO, fila: 15, seccion: "ODOO", cliente: "GLOBAL SUPPLY SOCIEDAD ANONIMA", numero: "FAC/2026/0207", fechaFactura: "2026-02-04", total: 169.5, estado: "SIN_PAGAR", periodo: "2026-02" }),
    ];
    expect(planDeCargaCompleta(filaOtra, otra, opciones).fechas).toEqual([]);
  });

  it("la bitácora nombra la firma, las dos fechas, el número y la fila del Excel", () => {
    expect(textoDeFechaDelExcel({ numero: "FAC/2026/0295", antes: "2026-06-30", fecha: "2026-06-10", fuente: `«${ODOO}» fila 74` }, ALEX)).toBe(
      `${ALEX} corrigió la fecha de emisión de 2026-06-30 a 2026-06-10, la de la factura FAC/2026/0295 según el Excel de Alexander («${ODOO}» fila 74). Es una de las tres facturas que Alex decidió devolver a por cobrar el 2026-09-12; volvió con la fecha de la quincena.`,
    );
  });
});

describe("Iberorutas 0328 y Honda 0311: la carga dice lo mismo que «Lo que no cuadra»", () => {
  const conCuotas: ContextoLibro = {
    ...ctx,
    cuentas: [
      { cuentaId: "ibero", nombre: "Iberorutas", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
      { cuentaId: "honda", nombre: "Honda Costa Rica", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    ],
    vinculos: [
      { odooPartnerId: 50, odooPartnerNombre: "SERVICIOS SAN MATEO Y SANTA ELENA DEL SUR SOCIEDAD ANONIMA", cuentaId: "ibero", ignorado: false },
      { odooPartnerId: 51, odooPartnerNombre: "FRANZ AMRHEIN & CO. SOCIEDAD ANONIMA", cuentaId: "honda", ignorado: false },
    ],
    facturas: [
      facturaDelEspejo({ numero: "FAC/2026/0328", odooPartnerId: 50, montoNeto: 7100, invoiceDate: "2026-08-19" }),
      facturaDelEspejo({ numero: "FAC/2026/0311", odooPartnerId: 51, montoNeto: 1000, invoiceDate: "2026-06-30", paymentState: "paid" }),
      facturaDelEspejo({ numero: "FAC/2026/0314", odooPartnerId: 51, montoNeto: 500, invoiceDate: "2026-07-15", paymentState: "paid" }),
    ],
    cobros: [
      cobroDeNexus({ id: "ib-may", cuentaId: "ibero", periodo: "2026-05", monto: 3550, estado: "POR_COBRAR", fechaEmision: "2026-05-15", promesaPago: "2026-08-31" }),
      cobroDeNexus({ id: "ib-jun", cuentaId: "ibero", periodo: "2026-06", monto: 3550, estado: "POR_COBRAR", fechaEmision: "2026-06-15", promesaPago: "2026-08-31" }),
      cobroDeNexus({ id: "ib-jul", cuentaId: "ibero", servicioId: "srv-qb", periodo: "2026-07", fechaProgramada: "2026-07-30", monto: 150, estado: "POR_COBRAR", fechaEmision: "2026-07-30" }),
      cobroDeNexus({ id: "ib-ago", cuentaId: "ibero", servicioId: "srv-qb", periodo: "2026-08", monto: 150 }),
      cobroDeNexus({ id: "h-may", cuentaId: "honda", periodo: "2026-05", monto: 500, estado: "COBRADO", confirmadoPor: ALEX }),
      cobroDeNexus({ id: "h-jun", cuentaId: "honda", periodo: "2026-06", monto: 500, estado: "COBRADO", confirmadoPor: ALEX }),
      cobroDeNexus({ id: "h-jul", cuentaId: "honda", periodo: "2026-07", monto: 500, estado: "COBRADO", confirmadoPor: ALEX, fechaEmision: "2026-07-15", numeroFactura: "FAC/2026/0314" }),
    ],
  };
  const filasCuotas = [
    filaDelLibro({ hoja: ODOO, fila: 90, seccion: "ODOO", cliente: "SERVICIOS SAN MATEO Y SANTA ELENA DEL SUR SOCIEDAD ANONIMA", numero: "FAC/2026/0328", fechaFactura: "2026-08-19", total: 8023, estado: "SIN_PAGAR", periodo: "2026-08", anotacion: "Ya se inicio la comuicación para cobro" }),
    filaDelLibro({ hoja: ODOO, fila: 66, seccion: "ODOO", cliente: "FRANZ AMRHEIN & CO. SOCIEDAD ANONIMA", numero: "FAC/2026/0311", fechaFactura: "2026-06-30", total: 1130, estado: "PAGADO", periodo: "2026-06", anotacion: "Pago de Mayo y Junio 2026" }),
  ];
  const plan = planDeCargaCompleta(filasCuotas, conCuotas, opciones);
  const deUna = (numero: string, motivo: string) => plan.paraUnaPersona.find((x) => x.numero === numero && x.motivo === motivo)?.detalle ?? "";

  it("Iberorutas: la 0328 cubre mayo + junio, no la cuota de US$150; nada se anota solo", () => {
    expect(deUna("FAC/2026/0328", "NO_COINCIDE")).toBe(
      "Monto: el libro dice US$7.100 neto y la factura cubre 2 cuotas de Iberorutas: mayo de 2026 por US$3.550 (por cobrar) + junio de 2026 por US$3.550 (por cobrar). Es lo mismo que propone Cobranza › Odoo › «Lo que no cuadra»: anotá FAC/2026/0328 en cada una desde el cronograma, no en la cuota de agosto de 2026 por US$150, que no es de esta factura. Anotación del Excel: «Ya se inicio la comuicación para cobro».",
    );
    expect(deUna("FAC/2026/0328", "ANOTACION_SIN_COBRO")).toBe(
      "La anotación «Ya se inicio la comuicación para cobro» no se escribe sola: la factura cubre mayo de 2026 por US$3.550 (por cobrar) + junio de 2026 por US$3.550 (por cobrar), y esas cuotas se confirman anotándoles FAC/2026/0328 desde el cronograma.",
    );
    expect(plan.paraUnaPersona.some((x) => x.detalle.includes("Marcala facturada con el número FAC/2026/0328"))).toBe(false);
    expect([plan.numeros, plan.anotaciones, plan.promesas]).toEqual([[], [], []]);
  });

  it("Honda: la 0311 cubre mayo + junio de 500", () => {
    expect(deUna("FAC/2026/0311", "NO_COINCIDE")).toContain(
      "la factura cubre 2 cuotas de Honda Costa Rica: mayo de 2026 por US$500 (cobrada) + junio de 2026 por US$500 (cobrada)",
    );
    /* La cuota atada por el mes (junio) es una de las dos: no se la descarta. */
    expect(deUna("FAC/2026/0311", "NO_COINCIDE")).toContain("anotá FAC/2026/0311 en cada una desde el cronograma. Anotación del Excel: «Pago de Mayo y Junio 2026».");
    expect(deUna("FAC/2026/0311", "NO_COINCIDE")).not.toContain("que no es de esta factura");
  });

  it("⭐ la segunda corrida dice exactamente lo mismo", () => {
    const segunda = planDeCargaCompleta(filasCuotas, plan.contextoFinal, { ...opciones, bitacora: plan.bitacoraFinal });
    expect(segunda.sinCambios).toBe(true);
    expect(segunda.paraUnaPersona).toEqual(plan.paraUnaPersona);
  });
});

describe("la promesa va a todas las cuotas del mismo número (Ecoquintas FAC/2026/0336)", () => {
  const eco = (promesa1880: string | null): ContextoLibro => ({
    ...ctx,
    facturas: [facturaDelEspejo({ numero: "FAC/2026/0336", odooPartnerId: 4, montoNeto: 3180, invoiceDate: "2026-09-03" })],
    cuentas: [...ctx.cuentas, { cuentaId: "ecoquintas", nombre: "Ecoquintas", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" }],
    vinculos: [...ctx.vinculos, { odooPartnerId: 4, odooPartnerNombre: "GRUPO ECOQUINTAS SOCIEDAD ANONIMA", cuentaId: "ecoquintas", ignorado: false }],
    cobros: [
      cobroDeNexus({ id: "eco-1880", cuentaId: "ecoquintas", servicioId: "web", periodo: "2026-06", monto: 1880, estado: "POR_COBRAR", fechaEmision: "2026-09-03", numeroFactura: "FAC/2026/0336", promesaPago: promesa1880 }),
      cobroDeNexus({ id: "eco-1300", cuentaId: "ecoquintas", servicioId: "impl", periodo: "2026-06", monto: 1300, estado: "POR_COBRAR", fechaEmision: "2026-09-03", numeroFactura: "FAC/2026/0336" }),
    ],
  });
  const filaEco = [
    filaDelLibro({ hoja: ODOO, fila: 95, seccion: "ODOO", cliente: "GRUPO ECOQUINTAS SOCIEDAD ANONIMA", numero: "FAC/2026/0336", fechaFactura: "2026-09-03", total: 3593.4, estado: "SIN_PAGAR", periodo: "2026-09", anotacion: "Ya se hablo con Lisbeth y realizan el pago a final de este mes" }),
  ];

  it("sin promesa en ninguna, van las dos", () => {
    expect(planDeCargaCompleta(filaEco, eco(null), opciones).promesas.map((p) => [p.cobroId, p.promesa]).sort()).toEqual([
      ["eco-1300", "2026-09-30"],
      ["eco-1880", "2026-09-30"],
    ]);
  });

  it("como estaba en producción —la de 1.880 ya prometida por Alex el 10-sep—: solo la que falta, y la segunda corrida no hace nada", () => {
    const plan = planDeCargaCompleta(filaEco, eco("2026-09-30"), opciones);
    expect(plan.promesas.map((p) => p.cobroId)).toEqual(["eco-1300"]);
    const segunda = planDeCargaCompleta(filaEco, plan.contextoFinal, { ...opciones, bitacora: plan.bitacoraFinal });
    expect(segunda.promesas).toEqual([]);
    expect(segunda.contextoFinal.cobros.map((c) => c.promesaPago)).toEqual(["2026-09-30", "2026-09-30"]);
  });
});
