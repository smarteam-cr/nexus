/**
 * lib/cobranza/libro-alex-aplicar.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/libro-alex-aplicar.test.ts --project unit`.
 *
 * Aplicar el libro de Alex (etapa 13). Los clientes y montos son los del libro real medidos el 2026-09-13
 * (solo lectura): Real Shipping, Quirinale e Ingeniería Verde (Grupo INB), McCann, JUDESUR, TEC-AE, IIA,
 * AMVAC, Multiquímica. La fecha de referencia es el día en que se subió el libro.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FilaLibro } from "./libro-alex-lectura";
import type { ContextoLibro } from "./libro-alex";
import {
  anotacionesNuevas,
  decidirCarga,
  fechaDeAnotacion,
  montoACargar,
  planDelLibro,
  textoDeAnotacion,
  type GrupoDelLibro,
  type PedidoDeAplicacion,
} from "./libro-alex-aplicar";
import { cobroDeNexus, facturaDelEspejo, filaDelLibro } from "./__fixtures__/libro-alex";

const HOY = "2026-09-13";
const ALEX = "aarrieta@smarteamcr.com";
const ODOO = "Asiento Contable por Mes ODOO";
const MERCURY = "Asientos Contables Mercury Bank";

/* ── 1. La fecha que trae una anotación ─────────────────────────────────────────── */

describe("fechaDeAnotacion: la promesa se propone solo si el texto trae una fecha", () => {
  it.each([
    ["15 de setiembre", "2026-09-15"],
    ["Ya está con promesa de pago para este mes 15 de setiembre", "2026-09-15"],
    ["Estimado de Pago 15 de Setiembre ", "2026-09-15"],
    ["Ya se hablo con Lisbeth y realizan el pago a final de este mes", "2026-09-30"],
    ["a finales de octubre", "2026-10-31"],
    ["pagan a fin del próximo mes", "2026-10-31"],
    ["depositan el 20/09", "2026-09-20"],
    ["2026-10-02", "2026-10-02"],
  ])("«%s» → %s", (texto, fecha) => {
    expect(fechaDeAnotacion(texto, HOY)).toBe(fecha);
  });

  it.each([
    "esta semana",
    "Promesa de Pago esta semana tras presentación de prueba",
    "Recaudación - Solicitar depósito para dar de baja a la cuenta",
    "31 de febrero",
    "",
  ])("«%s» → null: no es una fecha, y no se inventa una", (texto) => {
    expect(fechaDeAnotacion(texto, HOY)).toBeNull();
  });

  it("sin año, una fecha que quedaría más de medio año atrás es del año siguiente", () => {
    expect(fechaDeAnotacion("15 de enero", "2026-12-20")).toBe("2027-01-15");
    expect(fechaDeAnotacion("final de este mes", "2026-02-10")).toBe("2026-02-28");
  });
});

/* ── Armado ─────────────────────────────────────────────────────────────────────── */

const ctx: ContextoLibro = {
  cuentas: [
    { cuentaId: "rs", nombre: "Real Shipping & Trade", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
    { cuentaId: "inb", nombre: "Grupo INB", razonSocial: null, cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
    { cuentaId: "judesur", nombre: "JUDESUR", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "tec", nombre: "TEC- AE", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "iia", nombre: "IIA", razonSocial: null, cedulaJuridica: "3101543051", tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "amvac", nombre: "Amvac Latam", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "mq", nombre: "Multiquimica", razonSocial: "Multiquimica", cedulaJuridica: null, tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
    { cuentaId: "mccann", nombre: "McCann", razonSocial: null, cedulaJuridica: null, tipo: "NACIONAL", viaCobro: "ODOO" },
    { cuentaId: "bluesat", nombre: "BLUESAT", razonSocial: null, cedulaJuridica: "3101641911", tipo: "NACIONAL", viaCobro: "ODOO" },
  ],
  vinculos: [
    { odooPartnerId: 1, odooPartnerNombre: "ILEANA AGUILAR INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA", cuentaId: "iia", ignorado: false },
    { odooPartnerId: 5, odooPartnerNombre: "AMVAC DE COSTA RICA SOCIEDAD DE RESPONSABILIDAD LIMITADA", cuentaId: "amvac", ignorado: false },
    { odooPartnerId: 20, odooPartnerNombre: "JUNTA DE DESARROLLO REGIONAL DE LA ZONA SUR", cuentaId: "judesur", ignorado: false },
    { odooPartnerId: 21, odooPartnerNombre: "FUNDACION TECNOLOGICA DE COSTA RICA", cuentaId: "tec", ignorado: false },
    { odooPartnerId: 168, odooPartnerNombre: "MCCANN ERICKSON CENTROAMERICANA (COSTA RICA) SOCIEDAD ANONIMA", cuentaId: null, ignorado: false },
  ],
  facturas: [
    facturaDelEspejo({ numero: "FAC/2026/0330", odooPartnerId: 20, montoNeto: 704563, moneda: "CRC", invoiceDate: "2026-08-24" }),
    facturaDelEspejo({ numero: "FAC/2026/0200", odooPartnerId: 21, montoNeto: 1620, invoiceDate: "2026-01-10", paymentState: "paid" }),
    facturaDelEspejo({ numero: "FAC/2026/0208", odooPartnerId: 1, montoNeto: 60, invoiceDate: "2026-02-05", paymentState: "paid" }),
    facturaDelEspejo({ numero: "FAC/2026/0212", odooPartnerId: 1, montoNeto: 60, invoiceDate: "2026-02-20", paymentState: "paid" }),
    facturaDelEspejo({ numero: "FAC/2026/0327", odooPartnerId: 5, montoNeto: 1848, invoiceDate: "2026-08-15" }),
  ],
  cobros: [
    cobroDeNexus({ id: "iia-feb", cuentaId: "iia", periodo: "2026-02", monto: 60, estado: "COBRADO", confirmadoPor: ALEX, fechaEmision: "2026-02-15" }),
    cobroDeNexus({ id: "amvac-ago", cuentaId: "amvac", periodo: "2026-08", monto: 1848, estado: "POR_COBRAR", fechaEmision: "2026-08-15", promesaPago: "2026-09-14" }),
    /* Dos cuotas de enero: con una sola, la comparación la ata como «la única del mes» y la factura ya no falta. */
    cobroDeNexus({ id: "rs-ene", cuentaId: "rs", periodo: "2026-01", monto: 4000 }),
    cobroDeNexus({ id: "rs-ene-b", cuentaId: "rs", servicioId: "rs-web", periodo: "2026-01", monto: 1000 }),
    cobroDeNexus({ id: "inb-feb", cuentaId: "inb", periodo: "2026-02", monto: 12500 }),
    ...["06", "07", "08", "09", "10", "11"].flatMap((m, i) => [
      cobroDeNexus({ id: `wk-${m}`, cuentaId: "bluesat", servicioId: "wk", servicio: "Bluesat Welcome kit", periodo: `2026-${m}`, monto: 250, numCuota: i + 1 }),
      cobroDeNexus({ id: `sn-${m}`, cuentaId: "bluesat", servicioId: "sn", servicio: "Bluesat - SignNow", periodo: `2026-${m}`, monto: 700, numCuota: i + 1 }),
    ]),
  ],
  aliados: ["HubSpot", "Atom Chat", "Cooby"],
  servicios: [],
};

const libro: FilaLibro[] = [
  filaDelLibro({ hoja: MERCURY, fila: 5, seccion: "MERCURY", numero: "INV-9", cliente: "Real Shipping and Trade, SA DE CV", total: 6000, estado: "SIN_PAGAR", periodo: "2026-01", fechaFactura: "2026-01-20" }),
  filaDelLibro({ hoja: MERCURY, fila: 18, seccion: "MERCURY", numero: "INV-6-2", cliente: "Ingenieria Verde, S.A.", total: 12500, estado: "SIN_PAGAR", periodo: "2026-02", fechaFactura: "2026-02-10" }),
  filaDelLibro({ hoja: MERCURY, fila: 30, seccion: "MERCURY", numero: "INV-19", cliente: "Quirinale Group, S.A.", total: 3166.67, estado: "SIN_PAGAR", periodo: "2026-05", fechaFactura: "2026-05-10" }),
  filaDelLibro({ hoja: MERCURY, fila: 45, seccion: "MERCURY", numero: "INV-30", cliente: "Quirinale Group, S.A.", total: 6333.34, estado: "SIN_PAGAR", periodo: "2026-07", fechaFactura: "2026-07-10" }),
  filaDelLibro({ hoja: MERCURY, fila: 70, seccion: "MERCURY", numero: "INV-55", cliente: "Multiquimica Dominicana, S.A I 1-01-10772-3", total: 1627, estado: "SIN_PAGAR", periodo: "2026-09", fechaFactura: "2026-09-09" }),
  filaDelLibro({ hoja: MERCURY, fila: 41, seccion: "MERCURY", numero: "INV-26", cliente: "INSIDER DIGITAL SOCIEDAD ANONIMA DE CAPITAL VARIABLE / IDI220418NB4", total: 5226, estado: "PAGADO", periodo: "2026-06", fechaFactura: "2026-06-05" }),
  filaDelLibro({ hoja: ODOO, fila: 120, seccion: "ODOO", numero: "FAC/2026/0343", cliente: "MCCANN ERICKSON CENTROAMERICANA (COSTA RICA) SOCIEDAD ANONIMA", total: 13041612.44, moneda: "CRC", estado: "SIN_PAGAR", periodo: "2026-09", fechaFactura: "2026-09-05" }),
  filaDelLibro({ hoja: ODOO, fila: 109, seccion: "ODOO", numero: "FAC/2026/0330", cliente: "JUNTA DE DESARROLLO REGIONAL DE LA ZONA SUR", total: 796156.19, moneda: "CRC", estado: "SIN_PAGAR", periodo: "2026-08", fechaFactura: "2026-08-24", anotacion: "Estimado de Pago 15 de Setiembre " }),
  filaDelLibro({ hoja: ODOO, fila: 8, seccion: "ODOO", numero: "FAC/2026/0200", cliente: "FUNDACION TECNOLOGICA DE COSTA RICA", total: 1652.4, estado: "PAGADO", periodo: "2026-01", fechaFactura: "2026-01-10" }),
  filaDelLibro({ hoja: ODOO, fila: 15, seccion: "ODOO", numero: "FAC/2026/0208", cliente: "ILEANA AGUILAR INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA", total: 67.8, estado: "PAGADO", periodo: "2026-02", fechaFactura: "2026-02-05" }),
  filaDelLibro({ hoja: ODOO, fila: 19, seccion: "ODOO", numero: "FAC/2026/0212", cliente: "ILEANA AGUILAR INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA", total: 67.8, estado: "PAGADO", periodo: "2026-02", fechaFactura: "2026-02-20" }),
  filaDelLibro({ hoja: ODOO, fila: 105, seccion: "ODOO", numero: "FAC/2026/0327", cliente: "AMVAC DE COSTA RICA SOCIEDAD DE RESPONSABILIDAD LIMITADA", total: 2088.24, estado: "SIN_PAGAR", periodo: "2026-08", fechaFactura: "2026-08-15", anotacion: "Ya está con promesa de pago para este mes 15 de setiembre" }),
  filaDelLibro({ hoja: "Asiento contable de Recaudo QBs", fila: 3, seccion: "QUICKBOOKS", cliente: "Sfera Legal", total: 3800, pendiente: 3800 }),
  filaDelLibro({
    hoja: "Asiento contable de Recaudo QBs",
    fila: 10,
    seccion: "NO_INSCRITOS",
    cliente: "Bluesat",
    proyecto: "Welcome Kit + SignNow",
    total: 5700,
    pendiente: 3800,
    anotacion: "A setiembre - Pero se mantiene en Octubre y Noviembre con cuotas de $950",
  }),
];

const plan = planDelLibro(libro, ctx, HOY);
const grupo = (cliente: string): GrupoDelLibro => {
  const g = plan.grupos.find((x) => x.cliente === cliente);
  if (!g) throw new Error(`No hay grupo para ${cliente}`);
  return g;
};
const factura = (cliente: string, numero: string) => {
  const f = grupo(cliente).facturas.find((x) => x.numero === numero);
  if (!f) throw new Error(`No hay factura ${numero} en ${cliente}`);
  return f;
};

/* ── 2. El plan ─────────────────────────────────────────────────────────────────── */

describe("el plan: qué entraría, en qué cuenta y qué tiene que decir Alex", () => {
  it("solo carga lo que Nexus no tiene: lo que coincide no está en ningún grupo", () => {
    const numeros = plan.grupos.flatMap((g) => g.facturas.map((f) => f.numero));
    expect(numeros).not.toContain("FAC/2026/0208");
    expect(numeros).not.toContain("FAC/2026/0327");
    expect(numeros).toEqual(expect.arrayContaining(["INV-9", "INV-19", "INV-30", "FAC/2026/0343", "FAC/2026/0330", "FAC/2026/0212"]));
  });

  it("una sociedad sin cuenta queda en un grupo con sus facturas, primero, y la cuenta la elige Alex", () => {
    const q = grupo("Quirinale Group, S.A.");
    expect(q).toMatchObject({ cuenta: null, plataforma: "MERCURY", tipoSugerido: "INTERNACIONAL", pideIva: true, ivaSugerido: null });
    expect(q.facturas.map((f) => f.numero)).toEqual(["INV-19", "INV-30"]);
    expect(plan.grupos[0]?.cuenta).toBeNull();
  });

  it("la cuenta se propone por un hecho o por el nombre exacto; por parte del nombre, no", () => {
    expect(grupo("Real Shipping and Trade, SA DE CV").cuenta).toMatchObject({ cuentaId: "rs", via: "NOMBRE" });
    expect(grupo("JUNTA DE DESARROLLO REGIONAL DE LA ZONA SUR").cuenta).toMatchObject({ cuentaId: "judesur", via: "ODOO" });
    const mq = grupo("Multiquimica Dominicana, S.A I 1-01-10772-3");
    expect(mq.cuenta).toBeNull();
    expect(mq.cuentasPosibles.map((c) => c.cuentaId)).toEqual(["mq"]);
  });

  it("McCann: el cliente de Odoo sin emparejar se nombra para emparejarlo después, y el monto espera el IVA", () => {
    const m = grupo("MCCANN ERICKSON CENTROAMERICANA (COSTA RICA) SOCIEDAD ANONIMA");
    expect(m).toMatchObject({ cuenta: null, plataforma: "ODOO", tipoSugerido: "NACIONAL", monedaSugerida: "CRC", pideIva: true });
    expect(m.clienteDeOdoo).toMatch(/MCCANN/);
    expect(m.nombreSugerido).not.toMatch(/COSTA RICA\)/);
    expect(factura(m.cliente, "FAC/2026/0343")).toMatchObject({ neto: null, total: 13041612.44, totalSinIva: 11541249.95 });
  });

  it("JUDESUR: el neto del espejo manda y no pregunta el IVA; la anotación propone el 15 de setiembre", () => {
    const j = grupo("JUNTA DE DESARROLLO REGIONAL DE LA ZONA SUR");
    expect(j.pideIva).toBe(false);
    expect(factura(j.cliente, "FAC/2026/0330")).toMatchObject({ neto: 704563, moneda: "CRC", sugerida: true, promesaPropuesta: "2026-09-15" });
  });

  it("⛔ una factura que el libro da pagada no se tilda sola, y dice que el pago lo registra una persona", () => {
    const tec = factura("FUNDACION TECNOLOGICA DE COSTA RICA", "FAC/2026/0200");
    expect(tec).toMatchObject({ pagadaSegunLibro: true, sugerida: false });
    expect(tec.avisos.join(" ")).toMatch(/registra quien lo vea/);
  });

  it("una cuota del mismo mes sin número puede ser la misma factura: se avisa y no se tilda sola", () => {
    const rs = factura("Real Shipping and Trade, SA DE CV", "INV-9");
    expect(rs.sugerida).toBe(false);
    expect(rs.avisos.join(" ")).toMatch(/2 cuotas de enero de 2026 sin número \(US\$4\.000 \+ US\$1\.000\)/);
  });

  it("lo que no se carga dice por qué: QuickBooks sin número, y el fondo de marketing de Insider", () => {
    const motivos = new Map(plan.noSeCargan.map((n) => [n.numero ?? n.cliente, n.motivo]));
    expect(motivos.get("Sfera Legal")).toMatch(/QuickBooks/);
    expect(motivos.get("INV-26")).toMatch(/Ingresos variables/);
  });

  it("la anotación de un cobro que ya está va a SU bitácora, con la promesa propuesta al lado de la que tiene Nexus", () => {
    const a = plan.anotaciones.find((x) => x.numero === "FAC/2026/0327");
    expect(a).toMatchObject({ cobroId: "amvac-ago", promesaPropuesta: "2026-09-15", promesaActual: "2026-09-14" });
    expect(a?.texto).toBe(textoDeAnotacion("FAC/2026/0327", "AMVAC", "Ya está con promesa de pago para este mes 15 de setiembre"));
  });
});

/* ── 3. Lo que pide Alex, decidido ──────────────────────────────────────────────── */

const pedir = (grupos: PedidoDeAplicacion["grupos"], anotaciones: string[] = []) =>
  decidirCarga(plan, { grupos, anotaciones }, ctx, ALEX);

describe("decidirCarga: ⛔ nada entra como COBRADO", () => {
  it("Quirinale en Grupo INB: dos cobros POR COBRAR, netos, con la sociedad del documento y sin fecha de cobro", () => {
    const { cobros, rechazos } = pedir([{ clave: grupo("Quirinale Group, S.A.").clave, cuentaId: "inb", iva: "SIN_IVA", facturas: ["INV-19", "INV-30"] }]);
    expect(rechazos).toEqual([]);
    expect(cobros.map((c) => [c.numero, c.monto, c.estado])).toEqual([
      ["INV-19", 3166.67, "POR_COBRAR"],
      ["INV-30", 6333.34, "POR_COBRAR"],
    ]);
    expect(cobros[0]?.sociedad).toEqual({ plataforma: "MERCURY", nombre: "Quirinale Group, S.A", cedula: null, odooPartnerId: null });
    for (const c of cobros) {
      expect(Object.keys(c)).not.toEqual(expect.arrayContaining(["fechaCobro"]));
      expect(Object.keys(c)).not.toEqual(expect.arrayContaining(["confirmadoPor"]));
      expect(c.bitacora).toMatch(/Entra por cobrar/);
    }
  });

  it("toda factura decidida, de cualquier grupo, sale POR_COBRAR", () => {
    const { cobros } = pedir(
      plan.grupos.map((g) => ({
        clave: g.clave,
        cuentaId: g.cuenta?.cuentaId ?? "mccann",
        iva: "CON_IVA" as const,
        facturas: g.facturas.map((f) => f.clave),
      })),
    );
    expect(cobros.length).toBeGreaterThan(3);
    expect(new Set(cobros.map((c) => c.estado))).toEqual(new Set(["POR_COBRAR"]));
  });

  it("sin decir el IVA de una factura que no está en el espejo, no se carga", () => {
    const { cobros, rechazos } = pedir([{ clave: grupo("Quirinale Group, S.A.").clave, cuentaId: "inb", iva: null, facturas: ["INV-19"] }]);
    expect(cobros).toEqual([]);
    expect(rechazos[0]?.motivo).toMatch(/traen IVA/);
  });

  it("McCann con IVA: ₡11.541.249,95 neto, y la ficha de Odoo 168 como sociedad del documento", () => {
    const m = grupo("MCCANN ERICKSON CENTROAMERICANA (COSTA RICA) SOCIEDAD ANONIMA");
    const { cobros } = pedir([{ clave: m.clave, cuentaId: "mccann", iva: "CON_IVA", facturas: ["FAC/2026/0343"] }]);
    expect(cobros[0]).toMatchObject({ monto: 11541249.95, moneda: "CRC", sociedad: { plataforma: "ODOO", odooPartnerId: 168 } });
    expect(montoACargar(factura(m.cliente, "FAC/2026/0343"), "SIN_IVA")).toBe(13041612.44);
  });

  it("JUDESUR entra con el neto del espejo aunque no se diga el IVA; en otra cuenta, no: el documento dice de quién es", () => {
    const j = grupo("JUNTA DE DESARROLLO REGIONAL DE LA ZONA SUR");
    expect(pedir([{ clave: j.clave, cuentaId: "judesur", iva: null, facturas: ["FAC/2026/0330"] }]).cobros[0]).toMatchObject({
      monto: 704563,
      sociedad: { odooPartnerId: 20 },
    });
    const enTec = pedir([{ clave: j.clave, cuentaId: "tec", iva: null, facturas: ["FAC/2026/0330"] }]);
    expect(enTec.cobros).toEqual([]);
    expect(enTec.rechazos[0]?.motivo).toMatch(/emparejado con JUDESUR/);
  });

  it("IIA 0212: la cuota de febrero ya es de la 0208, así que no la frena; y la pagada dice que el pago lo registra una persona", () => {
    const { cobros, rechazos } = pedir([
      { clave: grupo("ILEANA AGUILAR INGENIERIA Y ADMINISTRACION SOCIEDAD ANONIMA").clave, cuentaId: "iia", iva: null, facturas: ["FAC/2026/0212"] },
    ]);
    expect(rechazos).toEqual([]);
    expect(cobros[0]).toMatchObject({ numero: "FAC/2026/0212", monto: 60, pagadaSegunLibro: true });
    expect(cobros[0]?.bitacora).toMatch(/registrá el pago en este cobro con el comprobante/);
  });

  it("la cuenta elegida ya tiene la cuota del mes con ese monto: es esa factura, no se carga otra", () => {
    const { cobros, rechazos } = pedir([{ clave: grupo("Ingenieria Verde, S.A.").clave, cuentaId: "inb", iva: "SIN_IVA", facturas: ["INV-6-2"] }]);
    expect(cobros).toEqual([]);
    expect(rechazos[0]?.motivo).toMatch(/ya tiene la cuota de febrero de 2026 por US\$12\.500: es esta factura/);
  });

  it("con la pantalla vieja: un número que mientras tanto se anotó en otra cuenta se rechaza con el nombre", () => {
    const hoy: ContextoLibro = { ...ctx, cobros: [...ctx.cobros, cobroDeNexus({ id: "tec-x", cuentaId: "tec", periodo: "2026-05", monto: 10, numeroFactura: "INV-19" })] };
    const r = decidirCarga(plan, { grupos: [{ clave: grupo("Quirinale Group, S.A.").clave, cuentaId: "inb", iva: "SIN_IVA", facturas: ["INV-19"] }], anotaciones: [] }, hoy, ALEX);
    expect(r.cobros).toEqual([]);
    expect(r.rechazos[0]?.motivo).toMatch(/ya está anotada en TEC- AE/);
  });

  it("un grupo que el plan ya no trae, o una cuenta que no existe, se rechazan sin cargar", () => {
    const r = pedir([
      { clave: "MERCURY:no existe", cuentaId: "inb", iva: "SIN_IVA", facturas: ["INV-99"] },
      { clave: grupo("Quirinale Group, S.A.").clave, cuentaId: "borrada", iva: "SIN_IVA", facturas: ["INV-19"] },
    ]);
    expect(r.cobros).toEqual([]);
    expect(r.rechazos.map((x) => x.motivo)).toEqual([expect.stringMatching(/ya no la trae/), expect.stringMatching(/ya no existe/)]);
  });

  it("solo las anotaciones pedidas, y una llave desconocida no escribe nada", () => {
    const a = plan.anotaciones.find((x) => x.numero === "FAC/2026/0327");
    expect(pedir([], [a?.clave ?? "", "otra|cosa"]).anotaciones.map((x) => x.cobroId)).toEqual(["amvac-ago"]);
  });
});

/* ── 4. Aplicar dos veces deja una sola entrada ─────────────────────────────────── */

describe("anotacionesNuevas: aplicar dos veces deja una sola entrada", () => {
  const texto = textoDeAnotacion("FAC/2026/0327", "AMVAC", "15 de setiembre");

  it("la que ya está en la bitácora de ese cobro no se vuelve a escribir; en otro cobro, sí", () => {
    const pedidas = [
      { cuentaId: "amvac", cobroId: "amvac-ago", texto },
      { cuentaId: "amvac", cobroId: "amvac-sep", texto },
    ];
    expect(anotacionesNuevas(pedidas, [{ cuentaId: "amvac", cobroId: "amvac-ago", contenido: texto }])).toEqual([
      { cuentaId: "amvac", cobroId: "amvac-sep", texto },
    ]);
  });

  it("la misma dos veces en el mismo pedido entra una vez", () => {
    expect(anotacionesNuevas([{ cuentaId: "a", cobroId: "x", texto }, { cuentaId: "a", cobroId: "x", texto }], [])).toHaveLength(1);
  });

  it("la de la cuenta se reconoce en la bitácora de esa cuenta, no en la de otra", () => {
    const deCuenta = { cuentaId: "bluesat", cobroId: null, texto };
    expect(anotacionesNuevas([deCuenta], [{ cuentaId: "bluesat", cobroId: null, contenido: texto }])).toEqual([]);
    expect(anotacionesNuevas([deCuenta], [{ cuentaId: "otra", cobroId: null, contenido: texto }])).toEqual([deCuenta]);
  });

  it("Bluesat: la anotación de la fila de «No inscritos» va UNA vez a la cuenta, no a cada una de sus doce cuotas", () => {
    const deBluesat = plan.anotaciones.filter((a) => a.cuentaId === "bluesat");
    expect(deBluesat).toHaveLength(1);
    expect(deBluesat[0]).toMatchObject({ cobroId: null, cuotas: 12, promesaPropuesta: null });
  });

  it("el texto no lleva quién ni cuándo: es la llave", () => {
    expect(texto).toBe("Anotación del libro de Alex sobre la factura FAC/2026/0327: «15 de setiembre»");
  });
});

/* ── 5. ⛔ Lo que escribe no puede pintar un verde ──────────────────────────────── */

const RAIZ = join(__dirname, "..", "..");
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fuente = (rel: string) => sinComentarios(readFileSync(join(RAIZ, rel), "utf8"));
const ESCRITURA = /\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw/g;

describe("⛔ aplicar el libro no escribe COBRADO ni fecha de cobro (INV3, INV5)", () => {
  const SERVIDOR = "lib/cobranza/libro-alex-aplicar-server.ts";

  it("el servidor escribe solo el cobro nuevo, su servicio, su bitácora y el lote; el estado, por el chokepoint", () => {
    const escrituras = new Set([...fuente(SERVIDOR).matchAll(ESCRITURA)].map((m) => m[0]));
    expect([...escrituras].sort()).toEqual(
      [
        ".bitacoraCobro.create(",
        ".bitacoraCobro.createMany(",
        ".cobro.create(",
        ".importacionCobranza.update(",
        ".servicioContratado.create(",
        ".servicioContratado.update(",
      ].sort(),
    );
    expect(fuente(SERVIDOR)).toMatch(/cambiarEstadoCobroTx\(/);
  });

  it("⛔ ni el servidor, ni la ruta, ni el módulo puro, ni la pantalla nombran COBRADO, la fecha de cobro o la firma de confirmación", () => {
    for (const f of [
      SERVIDOR,
      "lib/cobranza/libro-alex-aplicar.ts",
      "app/api/cobranza/import/[importId]/aplicar/route.ts",
      "components/cobranza/AplicarLibroAlex.tsx",
    ]) {
      const src = fuente(f);
      expect(src, f).not.toMatch(/["']COBRADO["']\s*[,})]/);
      expect(src, f).not.toMatch(/estado:\s*["']COBRADO["']/);
      expect(src, f).not.toMatch(/fechaCobro|confirmadoPor/);
    }
  });

  it("el cobro nace sin estado propio y la factura pasa con el estado del plan, que por tipo solo es POR_COBRAR", () => {
    const src = fuente(SERVIDOR);
    const alta = src.match(/\.cobro\.create\(\{[\s\S]*?\}\)/)?.[0] ?? "";
    expect(alta).not.toMatch(/estado|fechaEmision|numeroFactura/);
    expect(src).toMatch(/\{ estado: c\.estado, fechaEmision: c\.fechaFactura, numeroFactura: c\.numero, \.\.\.sociedad\.patch \}/);
    expect(fuente("lib/cobranza/libro-alex-aplicar.ts")).toMatch(/estado: "POR_COBRAR";/);
  });
});
