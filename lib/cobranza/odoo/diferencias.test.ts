/**
 * lib/cobranza/odoo/diferencias.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/odoo --project unit`.
 *
 * ── LO QUE ESTE ARCHIVO PROTEGE ─────────────────────────────────────────────────
 * La lista de diferencias es la agenda de una reunión con el CFO. Su modo de fallar no es
 * romperse: es **aparear dos cosas que no son la misma** y hacer desaparecer una diferencia
 * real de la lista. Eso no se nota mirando la pantalla — se nota meses después, cuando un
 * cobro que nadie revisó nunca resulta que no se facturó.
 *
 * Los números son los medidos el 2026-09-02 contra el espejo real: 347 facturas, 202 cobros.
 */
import { describe, it, expect } from "vitest";
import {
  clasificarNumerosSinPar,
  coberturaDelCruce,
  cruzar,
  detectarDiferenciasOdoo,
  esDocumentoVivo,
  facturasDeVariasCuotas,
  huellaDe,
  liberacionesPendientes,
  montosEnDosMonedas,
  montosPorMoneda,
  numeroVerificableEnOdoo,
  resumenDeDiferencias,
  textoDeMontos,
  type CobroParaCruzar,
  type DiferenciaOdoo,
  type DocumentoDelLibro,
  type ItemDiferencia,
  type ServicioParaCruzar,
  type FacturaParaCruzar,
  type LiberacionParaCruzar,
} from "./diferencias";

/**
 * Las filas como las lee una persona, sin su nombre propio (`fila`): la identidad y la huella tienen sus propias
 * pruebas, al final del archivo (2026-09-25).
 */
const comoSeLeen = (items: readonly ItemDiferencia[] | undefined) =>
  items?.map(({ id, texto, monto, moneda, nota }) => ({ id, texto, monto, moneda, nota }));

const cobro = (p: Partial<CobroParaCruzar> = {}): CobroParaCruzar => ({
  id: "c1",
  cuentaId: "cta1",
  cuentaNombre: "Selvatura",
  periodo: "2026-07",
  fechaProgramada: "2026-07-15",
  monto: 2000,
  moneda: "USD",
  estado: "POR_COBRAR",
  fechaEmision: "2026-07-15",
  numeroFactura: null,
  plataformaFactura: null,
  servicioId: "srv1",
  servicio: "Servicio",
  ...p,
});

/** Lo que el cruce necesita saber del emparejado y del espejo, en su forma más neutra. */
const alDia = {
  cuentasVinculadas: new Set<string>(["cta1"]),
  ultimaCorridaOk: "2026-09-02",
  /* Sin lote del Excel de Alexander: ninguna cuota trae su documento del libro. */
  libro: new Map<string, DocumentoDelLibro>(),
  servicios: new Array<ServicioParaCruzar>(),
};

const factura = (p: Partial<FacturaParaCruzar> = {}): FacturaParaCruzar => ({
  id: "f1",
  odooMoveId: 1,
  numero: "FAC/2026/0001",
  cuentaId: "cta1",
  odooPartnerId: 10,
  odooPartnerNombre: "INVERSIONES TURISTICAS MONTEVERDE SOCIEDAD ANONIMA",
  invoiceDate: "2026-07-15",
  montoNeto: 2000,
  montoTotal: 2260,
  /* Pagada por defecto: sin saldo. Las pruebas de «por cobrar» lo dicen con `not_paid`. */
  montoResidual: 0,
  montoImpuesto: 260,
  moneda: "USD",
  moveType: "out_invoice",
  paymentState: "paid",
  state: "posted",
  ...p,
});

const liberada = (p: Partial<LiberacionParaCruzar> = {}): LiberacionParaCruzar => ({
  id: "l1",
  cuentaId: "cta1",
  clienteNombre: "Wherex",
  numCuota: 2,
  periodo: "2026-06",
  monto: 2125,
  moneda: "USD",
  fechaEmision: "2026-06-15",
  referenciaExterna: "FAC/2026/0001",
  plataforma: "ODOO",
  decision: "CANCELAR",
  liberadaPor: "egonzalez@smarteamcr.com",
  liberadaEn: "2026-09-04",
  resuelta: false,
  ...p,
});

describe("cruzar cobros con facturas", () => {
  it("aparea por monto exacto de la misma cuenta", () => {
    const r = cruzar([cobro()], [factura()]);
    expect(r.pares).toHaveLength(1);
    expect(r.cobrosSolos).toHaveLength(0);
    expect(r.facturasSolas).toHaveLength(0);
  });

  it("⚠ compara en CENTAVOS, no en flotante", () => {
    /* Los importes de Odoo llegan con ruido (2000.0000000000002). Un par que no matchea por
       el decimal 15 es el error que nadie encuentra mirando la pantalla. */
    const r = cruzar([cobro({ monto: 2000.3 })], [factura({ montoNeto: 2000.1 + 0.2 })]);
    expect(r.pares).toHaveLength(1);
  });

  it("⛔ NUNCA aparea a través de monedas distintas", () => {
    /* Un cobro de USD 2.000 y una factura de CRC 2.000 no son el mismo hecho: son 500 veces
       distintos. Aparearlos haría desaparecer las dos diferencias de la lista. */
    const r = cruzar([cobro({ moneda: "USD" })], [factura({ moneda: "CRC" })]);
    expect(r.pares).toHaveLength(0);
    expect(r.cobrosSolos).toHaveLength(1);
    expect(r.facturasSolas).toHaveLength(1);
  });

  it("⛔ una nota de crédito no cubre una cuota", () => {
    /* Una nota CORRIGE una factura; no paga un cobro. Aparearla haría desaparecer un cobro
       que sigue pendiente. */
    const r = cruzar([cobro()], [factura({ moveType: "out_refund" })]);
    expect(r.pares).toHaveLength(0);
    expect(r.cobrosSolos).toHaveLength(1);
  });

  it("⛔ y una factura anulada tampoco", () => {
    const r = cruzar([cobro()], [factura({ state: "cancel" })]);
    expect(r.pares).toHaveLength(0);
  });

  it("no aparea con facturas de otra cuenta", () => {
    const r = cruzar([cobro({ cuentaId: "cta1" })], [factura({ cuentaId: "cta2" })]);
    expect(r.pares).toHaveLength(0);
  });

  it("⚠ la coincidencia EXACTA gana antes de que se reparta lo aproximado", () => {
    /* Si lo aproximado corriera primero, el cobro de 2.000 podría quedarse con la factura de
       2.100 y dejar al de 2.100 sin nada — dos diferencias inventadas de la nada. */
    const cobros = [cobro({ id: "cA", monto: 2000 }), cobro({ id: "cB", monto: 2100 })];
    const facturas = [
      factura({ id: "fA", odooMoveId: 1, montoNeto: 2100, numero: "F-A" }),
      factura({ id: "fB", odooMoveId: 2, montoNeto: 2000, numero: "F-B" }),
    ];
    const r = cruzar(cobros, facturas);
    expect(r.pares).toHaveLength(2);
    expect(r.montosDistintos).toHaveLength(0);
    expect(r.pares.find((p) => p.cobroId === "cA")?.facturaId).toBe("fB");
  });

  it("marca el monto distinto cuando la fecha está cerca", () => {
    const r = cruzar([cobro({ monto: 2000 })], [factura({ montoNeto: 1800, invoiceDate: "2026-07-20" })]);
    expect(r.pares).toHaveLength(0);
    expect(r.montosDistintos).toHaveLength(1);
    expect(r.montosDistintos[0]!.diferencia).toBe(-200);
  });

  it("⚠ pero fuera de la ventana de 45 días son cosas separadas", () => {
    /* Sin la ventana, una factura de enero se apareja con un cobro de diciembre y la lista
       reporta una «diferencia de monto» que en realidad son dos hechos distintos. */
    const r = cruzar([cobro({ monto: 2000 })], [factura({ montoNeto: 1800, invoiceDate: "2026-11-20" })]);
    expect(r.montosDistintos).toHaveLength(0);
    expect(r.cobrosSolos).toHaveLength(1);
    expect(r.facturasSolas).toHaveLength(1);
  });

  it("⛔ el monto exacto tampoco cruza los años", () => {
    /* La pasada exacta no tenía NINGUNA ventana. Con un cobro recurrente de USD 2.000, la
       factura de 2.000 de hace tres años se apareaba con el cobro de este mes — y el cobro de
       verdad quedaba «sin factura» sin que nada lo dijera. */
    const r = cruzar([cobro({ monto: 2000 })], [factura({ montoNeto: 2000, invoiceDate: "2023-07-15" })]);
    expect(r.pares).toHaveLength(0);
    expect(r.cobrosSolos).toHaveLength(1);
  });

  it("pero sí acepta unos meses de desfase, porque el monto exacto es evidencia fuerte", () => {
    /* Un cobro programado en enero facturado en abril es normal. */
    const r = cruzar([cobro({ monto: 2000 })], [factura({ montoNeto: 2000, invoiceDate: "2026-10-15" })]);
    expect(r.pares).toHaveLength(1);
  });

  it("⚠ el apareo es DETERMINISTA aunque las filas vengan en cualquier orden", () => {
    /* Sin desempate, dos facturas del mismo día por el mismo monto se ordenaban según el orden
       en que Postgres devolvió las filas — que sin ORDER BY no está garantizado. La lista del
       CFO cambiaba entre corridas sin que nadie hubiera tocado nada. */
    const fa = factura({ id: "fA", odooMoveId: 10, numero: "F-10" });
    const fb = factura({ id: "fB", odooMoveId: 20, numero: "F-20" });
    const r1 = cruzar([cobro()], [fa, fb]);
    const r2 = cruzar([cobro()], [fb, fa]);
    expect(r1.pares[0]?.facturaId).toBe(r2.pares[0]?.facturaId);
    expect(r1.pares[0]?.facturaId).toBe("fA"); // el odooMoveId más chico desempata
  });

  it("⛔ una factura no se usa dos veces", () => {
    const r = cruzar([cobro({ id: "cA" }), cobro({ id: "cB" })], [factura()]);
    expect(r.pares).toHaveLength(1);
    expect(r.cobrosSolos.length + r.montosDistintos.length).toBe(1);
  });
});

describe("el mismo monto en dos monedas", () => {
  it("⭐ detecta la factura emitida en la moneda equivocada", () => {
    /* Medido: 6 casos reales, el mayor de 11.541.250 — que en dólares es el 95,8 % de toda la
       facturación del espejo. Con un tipo de cambio de ~500 no puede ser casualidad. */
    const r = montosEnDosMonedas([
      factura({ id: "a", odooMoveId: 1, montoNeto: 11541250, moneda: "USD", numero: "FAC/2026/0243" }),
      factura({ id: "b", odooMoveId: 2, montoNeto: 11541250, moneda: "CRC", numero: "FAC/2026/0233" }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.monedas.sort()).toEqual(["CRC", "USD"]);
  });

  it("no marca al cliente que factura en dos monedas montos distintos", () => {
    /* Facturar en dólares y en colones es normal. Lo anómalo es el importe IDÉNTICO. */
    const r = montosEnDosMonedas([
      factura({ id: "a", odooMoveId: 1, montoNeto: 2000, moneda: "USD" }),
      factura({ id: "b", odooMoveId: 2, montoNeto: 1000000, moneda: "CRC" }),
    ]);
    expect(r).toHaveLength(0);
  });

  it("no cruza clientes distintos que casualmente facturan lo mismo", () => {
    const r = montosEnDosMonedas([
      factura({ id: "a", odooMoveId: 1, odooPartnerId: 10, montoNeto: 2000, moneda: "USD" }),
      factura({ id: "b", odooMoveId: 2, odooPartnerId: 11, montoNeto: 2000, moneda: "CRC" }),
    ]);
    expect(r).toHaveLength(0);
  });
});

describe("la lista para el CFO", () => {
  const base = {
    ...alDia,
    cuentasSinVinculo: 49,
    cuentasTotales: 49,
    liberaciones: [],
    cuentas: [],
    aceptadas: new Map<string, string>(),
  };

  it("⚠ NUNCA suma dólares con colones", () => {
    /* `convertir()` de lib/finanzas/equilibrio.ts es el único punto de conversión del sistema.
       Acá se muestran las dos cifras por separado; sumarlas daría un número que no existe. */
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "a", odooMoveId: 1, cuentaId: null, montoNeto: 1000, moneda: "USD", paymentState: "not_paid" }),
        factura({ id: "b", odooMoveId: 2, cuentaId: null, montoNeto: 500000, moneda: "CRC", paymentState: "not_paid" }),
      ],
    });
    const sinCuenta = lista.find((i) => i.codigo === "ODOO-SIN-CUENTA");
    expect(sinCuenta?.detalle).toContain("US$1.000 + ₡500.000");
    expect(sinCuenta?.montos).toEqual([
      { moneda: "USD", monto: 1000 },
      { moneda: "CRC", monto: 500000 },
    ]);
    expect(sinCuenta?.montoEnJuego).not.toBe(501000);
  });

  it("cada línea dice cuánta plata mueve y quién la resuelve", () => {
    /* Sin monto no se prioriza; sin dueño no se cierra nunca. */
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [cobro()],
      facturas: [factura({ cuentaId: null }), factura({ id: "f2", odooMoveId: 2, paymentState: "in_payment" })],
    });
    expect(lista.length).toBeGreaterThan(0);
    for (const i of lista) {
      expect(["SISTEMA", "COBRANZA", "DIRECCION"]).toContain(i.resuelve);
      expect(i.queHacer.length).toBeGreaterThan(10);
    }
  });

  it("ordena por plata: lo más caro arriba", () => {
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "a", odooMoveId: 1, cuentaId: null, montoNeto: 100, moneda: "USD" }),
        factura({ id: "b", odooMoveId: 2, montoNeto: 11541250, moneda: "USD", odooPartnerId: 77 }),
        factura({ id: "c", odooMoveId: 3, montoNeto: 11541250, moneda: "CRC", odooPartnerId: 77 }),
      ],
    });
    expect(lista[0]!.codigo).toBe("ODOO-MONEDA");
  });

  it("⚠ una diferencia aceptada desaparece — pero vuelve si los números cambian", () => {
    /* Se acepta ESA diferencia, no «este par para siempre». Una aceptación no puede ser el
       lugar donde se esconde un problema nuevo. */
    const facturas = [
      factura({ id: "b", odooMoveId: 2, montoNeto: 5000, moneda: "USD", odooPartnerId: 77 }),
      factura({ id: "c", odooMoveId: 3, montoNeto: 5000, moneda: "CRC", odooPartnerId: 77 }),
    ];
    const antes = detectarDiferenciasOdoo({ ...base, cobros: [], facturas });
    const moneda = antes.find((i) => i.codigo === "ODOO-MONEDA")!;

    const conAceptada = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas,
      aceptadas: new Map([["ODOO-MONEDA", huellaDe(moneda)]]),
    });
    /* ⚠ NO desaparece: se marca. Si se filtrara, «volver a abrir» sería inalcanzable y la
       línea quedaría cerrada para siempre por un clic. */
    expect(conAceptada.find((i) => i.codigo === "ODOO-MONEDA")?.aceptada).toBe(true);

    const cambiada = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: facturas.map((f) => ({ ...f, montoNeto: 9999 })),
      aceptadas: new Map([["ODOO-MONEDA", huellaDe(moneda)]]),
    });
    expect(cambiada.find((i) => i.codigo === "ODOO-MONEDA")?.aceptada).toBe(false);
  });

  it("los pagos sin conciliar con el banco se informan: no preguntan ni suman (2026-09-13)", () => {
    /* Hasta el 2026-09-13 la línea le preguntaba a dirección qué significaba el estado. Los datos ya lo
       contestan —las 181 tienen saldo 0 en Odoo: pago registrado, falta cruzarlo con el banco— y la
       respuesta es una lista para contabilidad, no una decisión. */
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "a", odooMoveId: 1, cuentaId: null, invoiceDate: "2025-11-03", paymentState: "in_payment" }),
        factura({ id: "b", odooMoveId: 2, cuentaId: null, invoiceDate: "2026-02-10", paymentState: "in_payment", moneda: "CRC", montoNeto: 25000 }),
        factura({ id: "c", odooMoveId: 3, cuentaId: null, invoiceDate: "2021-05-01", paymentState: "in_payment" }),
      ],
    });
    const l = lista.find((i) => i.codigo === "ODOO-IN-PAYMENT");
    if (!l) throw new Error("falta la línea de pagos sin conciliar");
    expect(l.titulo).toBe("2 facturas de 2025 y 2026 figuran pagadas en Odoo, pero el pago no está conciliado con el banco");
    expect(l.detalle).toContain("no les deja saldo");
    expect(l.detalle).toContain("Hay 1 más, de 2021, en la misma situación");
    expect(l.severidad).toBe("BAJA");
    expect(l.resuelve).toBe("COBRANZA");
    expect(l.plata, "no es plata por cobrar: no suma al encabezado").toEqual([]);
    expect([l.titulo, l.detalle, ...l.pasos, l.queSignificaAceptar, l.queHacer].join(" ")).not.toMatch(
      /in_payment|Enterprise|ODOO_PROMOCION_VERDE|administra/,
    );
  });

  it("⚠ no cuenta la misma plata dos veces", () => {
    /* ODOO-SIN-CUENTA es el BALDE: mientras falte emparejar, casi todo cae ahí y las líneas
       finas son subconjuntos suyos. Sumarlas todas contaría lo mismo tres veces — que es el
       error que ya se cometió en el módulo del que sale este contrato: el titular decía
       «$437.579,78 en juego» y sumaba $28.880 dos veces. `yaContadoEn` lo deja fuera del
       total sin quitarle el monto a la línea, que sigue sirviendo para dimensionarla. */
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "b", odooMoveId: 2, cuentaId: null, montoNeto: 11541250, moneda: "USD", odooPartnerId: 77, paymentState: "not_paid" }),
        factura({ id: "c", odooMoveId: 3, cuentaId: null, montoNeto: 11541250, moneda: "CRC", odooPartnerId: 77, paymentState: "not_paid" }),
      ],
    });
    expect(lista.find((i) => i.codigo === "ODOO-MONEDA")?.yaContadoEn).toBe("ODOO-SIN-CUENTA");
    expect(lista.find((i) => i.codigo === "ODOO-MONEDA")?.montoEnJuego).toBe(11541250);
    /* Y el balde AVISA de que su propio total está inflado por esas mismas facturas — con la
       cifra detectada, no con un «mucho menor» escrito a mano. */
    expect(lista.find((i) => i.codigo === "ODOO-SIN-CUENTA")?.detalle).toContain("INFLADO en US$11.541.250");
    /* ⭐ Y el encabezado cuenta cada factura una vez aunque la miren las dos líneas. */
    expect(resumenDeDiferencias(lista).plata).toEqual([
      { moneda: "USD", monto: 11541250 },
      { moneda: "CRC", monto: 11541250 },
    ]);
  });

  it("⚠ pero no avisa INFLADO cuando las gemelas no están en el balde", () => {
    /* Antes lo decía siempre que existiera la línea de moneda, aunque sus facturas ya tuvieran cuenta. */
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "b", odooMoveId: 2, cuentaId: "cta1", montoNeto: 5000, moneda: "USD", odooPartnerId: 77 }),
        factura({ id: "c", odooMoveId: 3, cuentaId: "cta1", montoNeto: 5000, moneda: "CRC", odooPartnerId: 77 }),
        factura({ id: "d", odooMoveId: 4, cuentaId: null, montoNeto: 10, moneda: "USD" }),
      ],
    });
    expect(lista.find((i) => i.codigo === "ODOO-SIN-CUENTA")?.detalle).not.toMatch(/INFLADO/);
  });

  it("pero una vez emparejadas, la línea fina cuenta por sí sola", () => {
    /* Cuando ya tienen cuenta no están en el balde, así que su plata sí es plata propia. */
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "b", odooMoveId: 2, cuentaId: "cta1", montoNeto: 5000, moneda: "USD", odooPartnerId: 77 }),
        factura({ id: "c", odooMoveId: 3, cuentaId: "cta1", montoNeto: 5000, moneda: "CRC", odooPartnerId: 77 }),
      ],
    });
    expect(lista.find((i) => i.codigo === "ODOO-MONEDA")?.yaContadoEn).toBeUndefined();
  });

  it("las aceptadas van al FINAL, no compiten con lo que hay que resolver", () => {
    const facturas = [
      factura({ id: "b", odooMoveId: 2, cuentaId: "cta1", montoNeto: 5000, moneda: "USD", odooPartnerId: 77 }),
      factura({ id: "c", odooMoveId: 3, cuentaId: "cta1", montoNeto: 5000, moneda: "CRC", odooPartnerId: 77 }),
      factura({ id: "d", odooMoveId: 4, cuentaId: null, montoNeto: 10, moneda: "USD" }),
    ];
    const antes = detectarDiferenciasOdoo({ ...base, cobros: [], facturas });
    const moneda = antes.find((i) => i.codigo === "ODOO-MONEDA")!;
    expect(antes[0]!.codigo, "sin aceptar, la más cara va primero").toBe("ODOO-MONEDA");

    const despues = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas,
      aceptadas: new Map([["ODOO-MONEDA", huellaDe(moneda)]]),
    });
    expect(despues[despues.length - 1]!.codigo, "aceptada, se va al final aunque sea la más cara").toBe(
      "ODOO-MONEDA",
    );
  });

  it("no inventa líneas cuando no hay nada que reportar", () => {
    expect(detectarDiferenciasOdoo({ ...base, cobros: [], facturas: [] })).toEqual([]);
  });
});

/**
 * ── ⭐ CUÁNDO DEJA DE HABER TRABAJO PENDIENTE ───────────────────────────────────
 * Nexus suelta la factura de este lado, pero el documento sigue emitido allá. Estas reglas son
 * lo único que hace que la línea se cierre — o que se quede abierta hasta que alguien la
 * cierre. Equivocarse hacia «cerrada» es lo caro: la plata sigue facturada contra un cliente
 * que ya no la debe, y nadie vuelve a mirarla.
 */
describe("⭐ liberaciones: la regla de cierre por plataforma", () => {
  const laFactura = factura({ numero: "FAC/2026/0001", odooPartnerId: 10, montoNeto: 2125, moneda: "USD" });

  it("ODOO + CANCELAR sigue abierta mientras el documento esté en el espejo", () => {
    const p = liberacionesPendientes([liberada()], [laFactura]);
    expect(p).toHaveLength(1);
    expect(p[0].porQue).toBe("documento-vigente");
  });

  it("ODOO + CANCELAR cierra cuando el documento sale del espejo", () => {
    /* El sync solo trae `estadoEspejo: VIGENTE`. Que ya no esté ES la evidencia de que
       alguien lo anuló: no hace falta preguntarle nada a nadie. */
    expect(liberacionesPendientes([liberada()], [])).toHaveLength(0);
  });

  it("⚠ ODOO + REVERTIR NO cierra porque el documento siga ahí: tiene que seguir ahí", () => {
    /* Es la diferencia entre las dos decisiones. Revertir deja los dos documentos; esperar a
       que el original desaparezca sería esperar para siempre. */
    const p = liberacionesPendientes([liberada({ decision: "REVERTIR" })], [laFactura]);
    expect(p).toHaveLength(1);
    expect(p[0].porQue).toBe("sin-nota-de-credito");
  });

  it("ODOO + REVERTIR cierra con la nota de crédito de igual monto, moneda y partner", () => {
    const nota = factura({
      id: "f2",
      odooMoveId: 2,
      numero: "NC/2026/0001",
      moveType: "out_refund",
      montoNeto: 2125,
      moneda: "USD",
      odooPartnerId: 10,
      invoiceDate: "2026-09-05",
    });
    expect(liberacionesPendientes([liberada({ decision: "REVERTIR" })], [laFactura, nota])).toHaveLength(0);
  });

  it("⚠ una nota de crédito de OTRO cliente no cierra nada", () => {
    const ajena = factura({
      id: "f3",
      odooMoveId: 3,
      numero: "NC/2026/0009",
      moveType: "out_refund",
      montoNeto: 2125,
      moneda: "USD",
      odooPartnerId: 99,
      invoiceDate: "2026-09-05",
    });
    expect(liberacionesPendientes([liberada({ decision: "REVERTIR" })], [laFactura, ajena])).toHaveLength(1);
  });

  it("⚠ ni una por el mismo número en la otra moneda", () => {
    /* El mismo defecto que ya costó caro en el emparejado: 2.125 en colones y 2.125 en dólares
       coinciden en número y no son lo mismo. */
    const enColones = factura({
      id: "f4",
      odooMoveId: 4,
      numero: "NC/2026/0010",
      moveType: "out_refund",
      montoNeto: 2125,
      moneda: "CRC",
      odooPartnerId: 10,
      invoiceDate: "2026-09-05",
    });
    expect(liberacionesPendientes([liberada({ decision: "REVERTIR" })], [laFactura, enColones])).toHaveLength(1);
  });

  it("MERCURY y OTRA no cierran nunca solas: no hay espejo que las vea", () => {
    const p = liberacionesPendientes(
      [liberada({ plataforma: "MERCURY" }), liberada({ id: "l2", plataforma: "OTRA" })],
      [], // ni siquiera con el espejo vacío
    );
    expect(p).toHaveLength(2);
    expect(p.map((x) => x.porQue)).toEqual(["sin-espejo", "sin-espejo"]);
  });

  it("pero sí las cierra una persona, y eso vale para cualquier plataforma", () => {
    expect(liberacionesPendientes([liberada({ plataforma: "MERCURY", resuelta: true })], [])).toHaveLength(0);
    expect(liberacionesPendientes([liberada({ resuelta: true })], [laFactura])).toHaveLength(0);
  });

  it("⚠ sin número de documento no cierra sola, aunque sea de Odoo", () => {
    /* Darla por buena dejaría la lista limpia inventando que alguien anuló algo. */
    const p = liberacionesPendientes([liberada({ referenciaExterna: null })], []);
    expect(p).toHaveLength(1);
    expect(p[0].porQue).toBe("sin-numero");
  });

  it("⚠⚠ un número que no tiene forma de Odoo cuenta como sin número: el sync nunca lo va a ver", () => {
    /* «666471587» es un número de transferencia. Tratado como número, una liberación CANCELAR se
       daba por cerrada al no encontrarlo en el espejo: inventaba que alguien anuló el documento. */
    const p = liberacionesPendientes([liberada({ referenciaExterna: "666471587" })], []);
    expect(p).toHaveLength(1);
    expect(p[0].porQue).toBe("sin-numero");
    expect(liberacionesPendientes([liberada({ referenciaExterna: "INV-16", decision: "REVERTIR" })], [])[0]?.porQue).toBe(
      "sin-numero",
    );
  });

  it("«FAC/2026/0001» ausente del espejo sigue cerrándose sola, aunque llegue escrito distinto", () => {
    expect(liberacionesPendientes([liberada()], [])).toHaveLength(0);
    expect(liberacionesPendientes([liberada({ referenciaExterna: " fac/2026/0001" })], [])).toHaveLength(0);
    /* Y escrito distinto también se encuentra cuando el documento sigue vigente. */
    const vigente = liberacionesPendientes(
      [liberada({ referenciaExterna: "fac / 2026 / 0001" })],
      [factura({ numero: "FAC/2026/0001" })],
    );
    expect(vigente.map((x) => x.porQue)).toEqual(["documento-vigente"]);
  });

  it("numeroVerificableEnOdoo: normalizado y con forma de Odoo, o null", () => {
    expect(numeroVerificableEnOdoo(" fac/2026/0001")).toBe("FAC/2026/0001");
    expect(numeroVerificableEnOdoo("NC/2026/0003")).toBe("NC/2026/0003");
    expect(numeroVerificableEnOdoo("666471587")).toBeNull();
    expect(numeroVerificableEnOdoo("INV-4-1")).toBeNull();
    expect(numeroVerificableEnOdoo(null)).toBeNull();
  });
});

describe("⚠ la factura liberada no se cuenta dos veces", () => {
  const base = {
    ...alDia,
    cuentasSinVinculo: 0,
    cuentasTotales: 1,
    cuentas: [],
    aceptadas: new Map<string, string>(),
  };
  /* Soltar una factura es, literalmente, quitarle su cobro: sin la exclusión aparecería como
     huérfana en ODOO-FACTURA-SIN-COBRO, además de en su propia línea. */
  const huerfana = factura({ numero: "FAC/2026/0001", cuentaId: "cta1", montoNeto: 2125 });

  it("sin liberación sale como factura sin cobro", () => {
    const lista = detectarDiferenciasOdoo({ ...base, cobros: [], facturas: [huerfana], liberaciones: [] });
    expect(lista.map((i) => i.codigo)).toContain("ODOO-FACTURA-SIN-COBRO");
  });

  it("con la liberación sale UNA vez, en la línea que la explica", () => {
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [huerfana],
      liberaciones: [liberada()],
    });
    const codigos = lista.map((i) => i.codigo);
    expect(codigos).not.toContain("ODOO-FACTURA-SIN-COBRO");
    expect(codigos).toContain("ODOO-LIBERADAS-PENDIENTES");
  });

  it("las de fuera de Odoo van en su propia línea, con salida MERCURY", () => {
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [],
      liberaciones: [liberada({ plataforma: "MERCURY" })],
    });
    const l = lista.find((i) => i.codigo === "LIBERADAS-FUERA-DE-ODOO");
    expect(l?.donde).toBe("MERCURY");
    expect(l?.montoEnJuego).toBe(2125);
  });

  it("una liberación resuelta no genera ninguna línea", () => {
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [],
      liberaciones: [liberada({ resuelta: true })],
    });
    expect(lista.map((i) => i.codigo)).not.toContain("ODOO-LIBERADAS-PENDIENTES");
  });
});

describe("el default que dice Odoo sobre cuentas que no facturan por Odoo", () => {
  const base = {
    ...alDia,
    cobros: [],
    facturas: [],
    liberaciones: [],
    cuentasSinVinculo: 0,
    cuentasTotales: 2,
    aceptadas: new Map<string, string>(),
  };

  it("las internacionales con viaCobro ODOO salen como línea propia, sin monto", () => {
    const lista = detectarDiferenciasOdoo({
      ...base,
      cuentas: [
        { id: "a", nombre: "Wherex", tipo: "INTERNACIONAL", viaCobro: "ODOO" },
        { id: "b", nombre: "Selvatura", tipo: "NACIONAL", viaCobro: "ODOO" },
        { id: "c", nombre: "Colby", tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
      ],
    });
    const l = lista.find((i) => i.codigo === "CUENTA-INTERNACIONAL-EN-ODOO");
    expect(l?.items).toHaveLength(1);
    expect(l?.items[0].texto).toBe("Wherex");
    /* Sin monto: el problema no es plata mal contada, es una etiqueta que manda a buscar al
       lugar equivocado. */
    expect(l?.montoEnJuego).toBeNull();
  });

  it("sin cuentas internacionales mal marcadas, la línea no existe", () => {
    const lista = detectarDiferenciasOdoo({
      ...base,
      cuentas: [{ id: "b", nombre: "Selvatura", tipo: "NACIONAL", viaCobro: "ODOO" }],
    });
    expect(lista.map((i) => i.codigo)).not.toContain("CUENTA-INTERNACIONAL-EN-ODOO");
  });
});

/**
 * ── ⚠ LO QUE SE PODÍA BORRAR SIN QUE NADA SE PUSIERA ROJO ──────────────────────
 * Una auditoría por mutación encontró que la condición de fecha al aparear la nota de crédito
 * se podía reemplazar por `true` y los 40 tests seguían pasando. Sin ella, una nota de crédito
 * VIEJA del mismo cliente y monto —una devolución anterior, sin relación— cierra una liberación
 * nueva: una factura que sigue emitida desaparece de la mesa del CFO sin que nadie la revirtiera.
 */
describe("⚠ la nota de crédito tiene que ser POSTERIOR a la factura", () => {
  const laFactura = factura({
    numero: "FAC/2026/0001",
    odooPartnerId: 10,
    montoNeto: 2125,
    moneda: "USD",
    invoiceDate: "2026-06-15",
  });
  const notaEn = (fecha: string) =>
    factura({
      id: `nc-${fecha}`,
      odooMoveId: 99,
      numero: `NC/${fecha}`,
      moveType: "out_refund",
      montoNeto: 2125,
      moneda: "USD",
      odooPartnerId: 10,
      invoiceDate: fecha,
    });

  it("una nota ANTERIOR no cierra nada, aunque coincida en todo lo demás", () => {
    const p = liberacionesPendientes([liberada({ decision: "REVERTIR" })], [laFactura, notaEn("2026-03-01")]);
    expect(p).toHaveLength(1);
    expect(p[0].porQue).toBe("sin-nota-de-credito");
  });

  it("una del MISMO día sí: revertir en el acto es legítimo", () => {
    expect(liberacionesPendientes([liberada({ decision: "REVERTIR" })], [laFactura, notaEn("2026-06-15")])).toHaveLength(0);
  });

  it("y una posterior también", () => {
    expect(liberacionesPendientes([liberada({ decision: "REVERTIR" })], [laFactura, notaEn("2026-09-01")])).toHaveLength(0);
  });
});

/**
 * ── ⚠⚠ SIN NÚMERO DE DOCUMENTO ES OTRA LÍNEA, NO UN MATIZ ──────────────────────
 * Se cierran de maneras distintas: con número el sync ve el documento anularse; sin número no
 * hay nada contra qué mirar. Juntas bajo un texto que promete «el sync las saca solas», la mitad
 * sin número quedaba esperando para siempre — y hasta la etapa 7 el número solo se escribía al
 * registrar el pago, así que un cobro facturado y no cobrado (justo el que se libera) casi nunca lo
 * tenía. Desde la etapa 7 la evidencia toma `Cobro.numeroFactura`.
 */
describe("⚠⚠ las liberadas de Odoo sin número van en su propia línea", () => {
  const base = {
    ...alDia,
    cobros: [],
    facturas: [],
    cuentasSinVinculo: 0,
    cuentasTotales: 1,
    cuentas: [],
    aceptadas: new Map<string, string>(),
  };

  it("la sin número sale aparte, con acción por fila y su propio pie", () => {
    const lista = detectarDiferenciasOdoo({ ...base, liberaciones: [liberada({ referenciaExterna: null })] });
    const conNumero = lista.find((i) => i.codigo === "ODOO-LIBERADAS-PENDIENTES");
    const sinNumero = lista.find((i) => i.codigo === "ODOO-LIBERADAS-SIN-NUMERO");
    expect(conNumero, "sin filas con número, esa línea no existe").toBeUndefined();
    expect(sinNumero?.montoEnJuego).toBe(2125);
    /* ⚠ La acción por fila es lo único que puede cerrarla: el sync no la ve. */
    expect(sinNumero?.accionPorItem).toBeDefined();
    /* ⚠ Y el pie NO puede ser el genérico de ODOO, que promete que desaparece sola. */
    expect(sinNumero?.pie).toBeTruthy();
  });

  it("una con un número que no es de Odoo va a la línea sin número, y la fila lo dice", () => {
    const lista = detectarDiferenciasOdoo({ ...base, liberaciones: [liberada({ referenciaExterna: "666471587" })] });
    const sinNumero = lista.find((i) => i.codigo === "ODOO-LIBERADAS-SIN-NUMERO");
    expect(sinNumero?.items[0]?.nota).toContain("666471587");
    expect(sinNumero?.items[0]?.nota).toContain("ese número no es de un documento de Odoo");
    expect(sinNumero?.accionPorItem, "sin sync que la vea, la cierra una persona").toBeDefined();
    expect(lista.find((i) => i.codigo === "ODOO-LIBERADAS-PENDIENTES")).toBeUndefined();
  });

  it("la que sí tiene número NO lleva acción por fila: la cierra el sync", () => {
    const lista = detectarDiferenciasOdoo({
      ...base,
      facturas: [factura({ numero: "FAC/2026/0001" })],
      liberaciones: [liberada()],
    });
    const conNumero = lista.find((i) => i.codigo === "ODOO-LIBERADAS-PENDIENTES");
    expect(conNumero).toBeDefined();
    /* Poder marcar «hecho» algo que el espejo verifica sería poder esconderlo. */
    expect(conNumero?.accionPorItem).toBeUndefined();
    expect(lista.find((i) => i.codigo === "ODOO-LIBERADAS-SIN-NUMERO")).toBeUndefined();
  });

  it("con las dos clases mezcladas salen las dos líneas, sin contar la misma plata dos veces", () => {
    const lista = detectarDiferenciasOdoo({
      ...base,
      facturas: [factura({ numero: "FAC/2026/0001" })],
      liberaciones: [liberada(), liberada({ id: "l2", monto: 500, referenciaExterna: null })],
    });
    expect(lista.find((i) => i.codigo === "ODOO-LIBERADAS-PENDIENTES")?.montoEnJuego).toBe(2125);
    expect(lista.find((i) => i.codigo === "ODOO-LIBERADAS-SIN-NUMERO")?.montoEnJuego).toBe(500);
  });
});

/**
 * ── ⭐ UNA SOLA REGLA DE «DOCUMENTO VIVO» ────────────────────────────────────────
 * Medido el 2026-09-12: cada línea filtraba a su manera, y la de moneda acusaba el par de
 * Publimark que ya estaba revertido en Odoo — y de ahí sacaba su «95,8 %» escrito a mano.
 */
describe("⭐ una sola regla de documento vivo", () => {
  const base = {
    ...alDia,
    cuentasSinVinculo: 0,
    cuentasTotales: 1,
    liberaciones: [],
    cuentas: [],
    aceptadas: new Map<string, string>(),
  };

  it("vivo = factura emitida; la nota de crédito, la anulada y la revertida no", () => {
    expect(esDocumentoVivo(factura())).toBe(true);
    expect(esDocumentoVivo(factura({ moveType: "out_refund" }))).toBe(false);
    expect(esDocumentoVivo(factura({ state: "cancel" }))).toBe(false);
    expect(esDocumentoVivo(factura({ paymentState: "reversed" }))).toBe(false);
  });

  it("⛔ una factura revertida no se aparea con un cobro", () => {
    /* Taparía un cobro que sigue pendiente: la factura revertida ya no le cobra nada a nadie. */
    const r = cruzar([cobro()], [factura({ paymentState: "reversed" })]);
    expect(r.pares).toHaveLength(0);
    expect(r.cobrosSolos).toHaveLength(1);
    expect(r.facturasSolas).toHaveLength(0);
  });

  it("las 4 filas de Publimark no generan ODOO-MONEDA: la de dólares ya está revertida", () => {
    const publimark = (p: Partial<FacturaParaCruzar>) =>
      factura({ odooPartnerId: 75, odooPartnerNombre: "PUBLIMARK SOCIEDAD ANONIMA", cuentaId: null, montoNeto: 11541250, ...p });
    const filas = [
      publimark({ id: "p1", odooMoveId: 232, numero: "FAC/2026/0232", moneda: "USD", paymentState: "reversed" }),
      publimark({ id: "p2", odooMoveId: 233, numero: "FAC/2026/0233", moneda: "CRC", paymentState: "paid" }),
      publimark({ id: "p3", odooMoveId: 243, numero: "FAC/2026/0243", moneda: "USD", moveType: "out_refund" }),
      publimark({ id: "p4", odooMoveId: 321, numero: "FAC/2026/0321", moneda: "CRC", paymentState: "not_paid" }),
    ];
    expect(montosEnDosMonedas(filas)).toEqual([]);
    expect(detectarDiferenciasOdoo({ ...base, cobros: [], facturas: filas }).map((i) => i.codigo)).not.toContain("ODOO-MONEDA");
  });

  it("Servica 90 sí la genera, y el peso en dólares sale de lo detectado", () => {
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "s1", odooMoveId: 231, odooPartnerId: 61, montoNeto: 90, moneda: "CRC", paymentState: "not_paid" }),
        factura({ id: "s2", odooMoveId: 268, odooPartnerId: 61, montoNeto: 90, moneda: "USD" }),
        factura({ id: "otra", odooMoveId: 9, odooPartnerId: 5, montoNeto: 20000, moneda: "USD" }),
      ],
    });
    const moneda = lista.find((i) => i.codigo === "ODOO-MONEDA");
    expect(moneda?.items).toHaveLength(1);
    expect(moneda?.detalle).toContain("Ninguna llega al 1 %");
    expect(moneda?.detalle).not.toContain("95,8");
  });

  it("…y cuando un par SÍ distorsiona los dólares, dice cuánto", () => {
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "u", odooMoveId: 1, odooPartnerId: 75, montoNeto: 11541250, moneda: "USD" }),
        factura({ id: "c", odooMoveId: 2, odooPartnerId: 75, montoNeto: 11541250, moneda: "CRC" }),
        factura({ id: "x", odooMoveId: 3, odooPartnerId: 5, montoNeto: 500000, moneda: "USD" }),
      ],
    });
    expect(lista.find((i) => i.codigo === "ODOO-MONEDA")?.detalle).toContain("pesa el 95,8 %");
  });

  it("las notas de crédito y las revertidas no suman en «sin cuenta»: se cuentan aparte", () => {
    /* Sumaban como si hubiera que cobrarlas. */
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "a", odooMoveId: 1, cuentaId: null, montoNeto: 1000, paymentState: "not_paid" }),
        factura({ id: "n", odooMoveId: 2, cuentaId: null, montoNeto: 1000, moveType: "out_refund" }),
        factura({ id: "r", odooMoveId: 3, cuentaId: null, montoNeto: 5000, paymentState: "reversed" }),
      ],
    });
    const l = lista.find((i) => i.codigo === "ODOO-SIN-CUENTA");
    expect(l?.titulo).toMatch(/^1 facturas por cobrar de clientes de Odoo/);
    expect(l?.montoEnJuego).toBe(1000);
    expect(l?.detalle).toContain("1 nota(s) de crédito");
    expect(l?.detalle).toContain("1 documento(s) anulados o revertidos");
    /* Y el paso que prometía «el sync recalcula la cuenta» ya no lo promete. */
    expect(l?.pasos.join(" ")).not.toMatch(/sync recalcula/);
  });
});

/**
 * ── ⚠⚠ «COBRO SIN FACTURA» SOLO ACUSA LO QUE SE PUEDE VERIFICAR ──────────────────
 * Medido el 2026-09-12: 148 cobros acusados por USD 237.355, la cifra más grande de la pantalla.
 * Sus facturas estaban en el espejo sin atribuir, 46 eran de cuentas sin emparejar y 8 de Mercury.
 */
describe("⚠⚠ «cobro sin factura» solo acusa lo que se puede verificar", () => {
  const base = {
    facturas: [],
    liberaciones: [],
    cuentas: [
      { id: "odoo", nombre: "Amvac Latam", tipo: "NACIONAL", viaCobro: "ODOO" },
      { id: "merc", nombre: "Colby", tipo: "NACIONAL", viaCobro: "MERCURY" },
      { id: "qbs", nombre: "Sfera", tipo: "NACIONAL", viaCobro: "OTRA" },
      { id: "suelta", nombre: "Wherex", tipo: "NACIONAL", viaCobro: "ODOO" },
    ],
    cuentasSinVinculo: 3,
    cuentasTotales: 4,
    cuentasVinculadas: new Set<string>(["odoo"]),
    libro: new Map<string, DocumentoDelLibro>(),
    servicios: new Array<ServicioParaCruzar>(),
    /* ⇒ corte = 2026-08-18 (15 días de gracia). */
    ultimaCorridaOk: "2026-09-02" as string | null,
    aceptadas: new Map<string, string>(),
  };
  const lineas = (cobros: CobroParaCruzar[], extra: Partial<typeof base> = {}) =>
    detectarDiferenciasOdoo({ ...base, ...extra, cobros });
  const acusa = (cobros: CobroParaCruzar[], extra: Partial<typeof base> = {}) =>
    lineas(cobros, extra).find((i) => i.codigo === "ODOO-COBRO-SIN-FACTURA");

  it("un cobro de una cuenta Mercury o QuickBooks no genera línea: no hay espejo que lo vea", () => {
    /* ⚠ Con las dos cuentas EMPAREJADAS: sin vínculo el cobro caía en «sin emparejar» y el test
       seguía verde aunque se borrara la regla de la vía. Un vínculo de Odoo en una cuenta que
       factura por Mercury no hace que Odoo vaya a ver esa factura. */
    const emparejadas = { cuentasVinculadas: new Set<string>(["odoo", "merc", "qbs"]) };
    const l = lineas([cobro({ id: "m", cuentaId: "merc" }), cobro({ id: "q", cuentaId: "qbs" })], emparejadas);
    expect(l.find((i) => i.codigo === "ODOO-COBRO-SIN-FACTURA")).toBeUndefined();
    expect(l.find((i) => i.codigo === "ODOO-SIN-CUENTA"), "tampoco se cuentan como «sin emparejar»").toBeUndefined();
    expect(acusa([cobro({ id: "m", cuentaId: "merc" }), cobro({ id: "q", cuentaId: "qbs" })])).toBeUndefined();
  });

  it("uno de una cuenta sin emparejar suma al conteo de ODOO-SIN-CUENTA, sin monto", () => {
    const l = lineas([cobro({ cuentaId: "suelta", cuentaNombre: "Wherex" })]);
    expect(l.find((i) => i.codigo === "ODOO-COBRO-SIN-FACTURA")).toBeUndefined();
    const sinCuenta = l.find((i) => i.codigo === "ODOO-SIN-CUENTA");
    expect(sinCuenta?.montoEnJuego).toBeNull();
    expect(sinCuenta?.detalle).toContain("1 cobro(s) facturados de cuentas sin emparejar");
    expect(comoSeLeen(sinCuenta?.items)).toEqual([{ texto: "Wherex — cuenta sin emparejar", nota: "1 cobro facturado sin verificar" }]);
    /* La fila es la cuenta, no su nombre. */
    expect(sinCuenta?.items[0]?.fila.clave).toBe("cuenta:suelta");
  });

  it("uno facturado después del corte no genera línea: el espejo todavía no pudo verlo", () => {
    expect(acusa([cobro({ cuentaId: "odoo", fechaEmision: "2026-08-19" })])).toBeUndefined();
    expect(acusa([cobro({ cuentaId: "odoo", fechaEmision: "2026-08-18" })]), "el día del corte sí entra").toBeDefined();
  });

  it("uno de una cuenta emparejada, facturado antes del corte y sin factura, sí: ALTA", () => {
    const l = acusa([
      cobro({ cuentaId: "odoo", fechaEmision: "2026-07-15", monto: 1848 }),
      cobro({ id: "c2", cuentaId: "odoo", fechaEmision: "2026-08-30" }),
    ]);
    expect(l?.severidad).toBe("ALTA");
    expect(l?.montoEnJuego).toBe(1848);
    expect(l?.items).toHaveLength(1);
    expect(l?.detalle).toContain("hasta el 2026-08-18");
    expect(l?.detalle).toContain("No se cuentan 1 cobro(s) facturados después de esa fecha");
  });

  it("un COBRADO sin fecha de emisión usa la programada; uno sin facturar no se acusa", () => {
    expect(acusa([cobro({ cuentaId: "odoo", estado: "COBRADO", fechaEmision: null, fechaProgramada: "2026-07-15" })])).toBeDefined();
    expect(acusa([cobro({ cuentaId: "odoo", estado: "COBRADO", fechaEmision: null, fechaProgramada: "2026-08-30" })])).toBeUndefined();
    expect(acusa([cobro({ cuentaId: "odoo", fechaEmision: null })])).toBeUndefined();
  });

  it("⛔ si el espejo nunca corrió bien, no acusa nada", () => {
    expect(acusa([cobro({ cuentaId: "odoo" })], { ultimaCorridaOk: null })).toBeUndefined();
  });

  it("⭐ etapa 12: la plataforma anotada en la factura manda sobre la de la cuenta", () => {
    /* Una factura de QuickBooks en una cuenta que factura por Odoo no la va a ver nunca el espejo; una de Odoo
       en una cuenta de Mercury, sí. */
    const emparejadas = { cuentasVinculadas: new Set<string>(["odoo", "merc"]) };
    expect(acusa([cobro({ cuentaId: "odoo", plataformaFactura: "OTRA" })], emparejadas)).toBeUndefined();
    expect(acusa([cobro({ cuentaId: "merc", plataformaFactura: "ODOO" })], emparejadas)).toBeDefined();
    expect(acusa([cobro({ cuentaId: "odoo", plataformaFactura: null })], emparejadas), "sin anotar, manda la cuenta").toBeDefined();
  });

  it("una factura de 2021 no entra a «factura sin cobro»: es de antes del primer cobro de la cuenta", () => {
    const l = detectarDiferenciasOdoo({
      ...base,
      cobros: [cobro({ cuentaId: "odoo", fechaProgramada: "2026-01-15", monto: 999, fechaEmision: null })],
      facturas: [
        factura({ id: "vieja", odooMoveId: 1, numero: "FAC/2021/0003", cuentaId: "odoo", invoiceDate: "2021-05-01", montoNeto: 2000 }),
        factura({ id: "nueva", odooMoveId: 2, numero: "FAC/2026/0320", cuentaId: "odoo", invoiceDate: "2026-08-01", montoNeto: 3333 }),
      ],
    }).find((i) => i.codigo === "ODOO-FACTURA-SIN-COBRO");
    expect(l?.items.map((i) => i.nota?.split(" · ")[0])).toEqual(["FAC/2026/0320"]);
    expect(l?.detalle).toContain("No se cuentan 1 factura(s) ya pagadas de antes del primer cobro");
  });
});

/**
 * ── ⭐ ETAPA 8 · CADA COBRO CON SU FACTURA REAL ──────────────────────────────────
 * Medido el 2026-09-12 sobre los 3 cobros que Alex identificó con su número: por monto se acertaba 1.
 * Seléctrica jun (USD 45, FAC/2026/0302) se apareaba con FAC/2026/0277 como «monto distinto», e IIA
 * jun (USD 60, FAC/2026/0295) quedaba sin factura. El número que una persona anotó y firmó manda.
 */
describe("⭐ el cobro con número se aparea por ese número", () => {
  it("caso 1 · se queda con SU factura aunque otra por el mismo monto esté más cerca", () => {
    const facturas = [
      factura({ id: "f277", odooMoveId: 277, numero: "FAC/2026/0277", invoiceDate: "2026-06-15", montoNeto: 45 }),
      factura({ id: "f302", odooMoveId: 302, numero: "FAC/2026/0302", invoiceDate: "2026-06-17", montoNeto: 45 }),
    ];
    const jun = cobro({ id: "jun", fechaProgramada: "2026-06-15", monto: 45 });
    expect(cruzar([jun], facturas).pares[0]?.facturaId, "por monto gana la más cercana").toBe("f277");

    /* Escrito como lo teclea una persona: el cruce normaliza igual que el chokepoint. */
    const r = cruzar([{ ...jun, numeroFactura: " fac / 2026 / 0302 " }], facturas);
    expect(r.pares).toEqual([{ cobroId: "jun", facturaId: "f302", cuentaNombre: "Selvatura", monto: 45, moneda: "USD", cuotas: 1 }]);
    expect(r.facturasSolas.map((f) => f.id)).toEqual(["f277"]);
  });

  it("caso 2 · varias cuotas con el mismo número son UNA factura compartida si la suma es el neto", () => {
    /* ALMOTEC: 3 × 2.300 contra FAC/2026/0329 por 6.900, emitida el 19-ago. */
    const almotec = ["2026-06", "2026-07", "2026-08"].map((periodo, i) =>
      cobro({
        id: `al${i + 1}`,
        cuentaNombre: "ALMOTEC",
        periodo,
        fechaProgramada: `${periodo}-15`,
        monto: 2300,
        estado: "PROGRAMADO",
        fechaEmision: "2026-08-19",
        numeroFactura: "FAC/2026/0329",
      }),
    );
    const f329 = factura({ id: "f329", odooMoveId: 329, numero: "FAC/2026/0329", invoiceDate: "2026-08-19", montoNeto: 6900, paymentState: "not_paid" });

    const r = cruzar(almotec, [f329]);
    expect(r.pares.map((p) => [p.cobroId, p.facturaId, p.cuotas])).toEqual([
      ["al1", "f329", 3],
      ["al2", "f329", 3],
      ["al3", "f329", 3],
    ]);
    expect(r.montosDistintos).toEqual([]);
    expect(r.cobrosSolos).toEqual([]);

    /* Sin número terminaba como está hoy en producción: una «diferencia de monto» inventada y dos
       cuotas sin factura. */
    const sinNumero = cruzar(almotec.map((c) => ({ ...c, numeroFactura: null })), [f329]);
    expect(sinNumero.montosDistintos).toHaveLength(1);
    expect(sinNumero.cobrosSolos).toHaveLength(2);
  });

  it("caso 3 · si la suma no es el neto es UN monto distinto de la factura entera, no un pago parcial", () => {
    const dos = [
      cobro({ id: "a", monto: 2300, numeroFactura: "FAC/2026/0329" }),
      cobro({ id: "b", fechaProgramada: "2026-08-15", monto: 2300, numeroFactura: "FAC/2026/0329" }),
    ];
    const f329 = factura({ id: "f329", odooMoveId: 329, numero: "FAC/2026/0329", montoNeto: 6900 });
    const r = cruzar(dos, [f329]);
    expect(r.pares).toEqual([]);
    expect(r.montosDistintos).toEqual([
      expect.objectContaining({ cobroId: "a", cobroIds: ["a", "b"], cuotas: 2, montoCobro: 4600, montoFactura: 6900, diferencia: 2300 }),
    ]);

    const monto = detectarDiferenciasOdoo({ ...alDia, cobros: dos, facturas: [f329], liberaciones: [], cuentas: [], cuentasSinVinculo: 0, cuentasTotales: 1, aceptadas: new Map() })
      .find((i) => i.codigo === "ODOO-MONTO");
    expect(monto?.items).toHaveLength(1);
    expect(monto?.items[0]?.texto).toMatch(/ en 2 cuotas vs Odoo /);
  });

  it("caso 4 · el número manda aunque la factura esté fuera de la ventana del monto aproximado", () => {
    const r = cruzar(
      [cobro({ monto: 2000, numeroFactura: "FAC/2026/0001" })],
      [factura({ montoNeto: 1800, invoiceDate: "2026-11-20" })],
    );
    expect(r.montosDistintos).toEqual([expect.objectContaining({ numero: "FAC/2026/0001", diferencia: -200, cuotas: 1 })]);
    expect(r.conNumeroSinPar).toEqual([]);
  });

  it("caso 5 · la factura que se llevó un número ya no la puede tomar otro cobro por monto", () => {
    const r = cruzar(
      [
        cobro({ id: "cA", fechaProgramada: "2026-07-15" }),
        cobro({ id: "cB", fechaProgramada: "2026-08-15", numeroFactura: "FAC/2026/0001" }),
      ],
      [factura({ id: "f1", numero: "FAC/2026/0001", invoiceDate: "2026-07-15" })],
    );
    expect(r.pares).toEqual([expect.objectContaining({ cobroId: "cB", facturaId: "f1" })]);
    expect(r.cobrosSolos.map((c) => c.id)).toEqual(["cA"]);
  });

  it("caso 6 · ⛔ un número que no encuentra su factura NO se aparea por monto con otra", () => {
    /* IIA: 60 con FAC/2026/0295, y en la cuenta hay otra factura de 60. Aparearlas sería desmentir el
       número que una persona anotó. */
    const r = cruzar(
      [cobro({ id: "iia", monto: 60, numeroFactura: "FAC/2026/0295" })],
      [factura({ id: "f274", numero: "FAC/2026/0274", montoNeto: 60 })],
    );
    expect(r.pares).toEqual([]);
    expect(r.montosDistintos).toEqual([]);
    expect(r.cobrosSolos, "tampoco es un «cobro sin factura»: su porqué es más fino").toEqual([]);
    expect(r.conNumeroSinPar.map((c) => c.id)).toEqual(["iia"]);
    expect(r.facturasSolas.map((f) => f.id)).toEqual(["f274"]);
  });

  it("⛔ el número no cruza cuentas ni monedas", () => {
    const c = cobro({ numeroFactura: "FAC/2026/0001" });
    expect(cruzar([c], [factura({ cuentaId: "cta2" })]).conNumeroSinPar).toHaveLength(1);
    expect(cruzar([c], [factura({ moneda: "CRC" })]).conNumeroSinPar).toHaveLength(1);
  });

  it("un número de Mercury no se busca en Odoo ni se aparea por monto; uno sin forma conocida sigue por monto", () => {
    const mercury = cruzar([cobro({ numeroFactura: "INV-16" })], [factura()]);
    expect(mercury.pares).toEqual([]);
    expect(mercury.conNumeroSinPar).toHaveLength(1);

    /* Un número de transferencia no es de ninguna plataforma: no hay contra qué buscarlo. */
    expect(cruzar([cobro({ numeroFactura: "666471587" })], [factura()]).pares).toHaveLength(1);
  });
});

describe("por qué un número no lleva a su factura", () => {
  const porQue = (numero: string, facturas: FacturaParaCruzar[], p: Partial<CobroParaCruzar> = {}) =>
    clasificarNumerosSinPar([cobro({ numeroFactura: numero, ...p })], facturas)[0];

  it("Odoo no tiene ese documento", () => {
    expect(porQue("fac/2026/0295", [])).toEqual({
      cobro: expect.objectContaining({ id: "c1" }),
      numero: "FAC/2026/0295",
      porQue: "sin-documento",
      documento: null,
    });
  });

  it("es de un cliente de Odoo emparejado con otra cuenta", () => {
    expect(porQue("FAC/2026/0001", [factura({ cuentaId: "cta2" })])?.porQue).toBe("otra-cuenta");
  });

  it("sin atribuir: el documento existe y su cliente de Odoo no está emparejado con nadie", () => {
    expect(porQue("FAC/2026/0001", [factura({ cuentaId: null })])?.porQue).toBe("sin-atribuir");
  });

  it("es una nota de crédito", () => {
    expect(porQue("NC/2026/0001", [factura({ numero: "NC/2026/0001", moveType: "out_refund" })])?.porQue).toBe("nota-de-credito");
  });

  it("la factura está anulada o revertida", () => {
    expect(porQue("FAC/2026/0001", [factura({ state: "cancel" })])?.porQue).toBe("anulada");
    expect(porQue("FAC/2026/0001", [factura({ paymentState: "reversed" })])?.porQue).toBe("anulada");
  });

  it("la factura está en otra moneda", () => {
    expect(porQue("FAC/2026/0001", [factura({ moneda: "CRC" })])?.porQue).toBe("otra-moneda");
  });

  it("es un número de Mercury", () => {
    expect(porQue("INV-4-1", [])?.porQue).toBe("numero-de-mercury");
  });

  it("un cobro que sí tiene su factura no recibe un porqué inventado", () => {
    expect(porQue("FAC/2026/0001", [factura()])).toBeUndefined();
  });
});

describe("«Lo que no cuadra» con el número de la factura", () => {
  const base = {
    liberaciones: [],
    cuentas: [
      { id: "cta1", nombre: "Seléctrica", tipo: "NACIONAL", viaCobro: "ODOO" },
      { id: "cta2", nombre: "Electrocaribe", tipo: "NACIONAL", viaCobro: "ODOO" },
      { id: "merc", nombre: "Colby", tipo: "NACIONAL", viaCobro: "MERCURY" },
    ],
    cuentasSinVinculo: 0,
    cuentasTotales: 3,
    cuentasVinculadas: new Set<string>(["cta1", "cta2", "merc"]),
    libro: new Map<string, DocumentoDelLibro>(),
    servicios: new Array<ServicioParaCruzar>(),
    /* ⇒ corte = 2026-08-18 (15 días de gracia). */
    ultimaCorridaOk: "2026-09-02" as string | null,
    aceptadas: new Map<string, string>(),
  };
  const lista = (cobros: CobroParaCruzar[], facturas: FacturaParaCruzar[] = [], extra: Partial<typeof base> = {}) =>
    detectarDiferenciasOdoo({ ...base, ...extra, cobros, facturas });
  const linea = (l: DiferenciaOdoo[], codigo: string) => l.find((i) => i.codigo === codigo);

  it("«Odoo no tiene ese documento» sale en su línea y NO en «cobro sin factura»: no se cuenta dos veces", () => {
    const iia = cobro({ id: "iia", monto: 60, periodo: "2026-06", fechaEmision: "2026-06-10", estado: "COBRADO" });
    const l = lista([{ ...iia, numeroFactura: "FAC/2026/0295" }]);
    const sinDoc = linea(l, "ODOO-NUMERO-SIN-DOCUMENTO");
    expect(sinDoc?.severidad).toBe("ALTA");
    expect(sinDoc?.montoEnJuego).toBe(60);
    expect(sinDoc?.items.map((i) => i.nota)).toEqual(["FAC/2026/0295 · Odoo no tiene ese documento · 2026-06 · COBRADO"]);
    expect(linea(l, "ODOO-COBRO-SIN-FACTURA")).toBeUndefined();

    /* El mismo cobro sin número sí es «cobro sin factura»: la plata va a una sola de las dos líneas. */
    const sinNumero = lista([iia]);
    expect(linea(sinNumero, "ODOO-COBRO-SIN-FACTURA")?.montoEnJuego).toBe(60);
    expect(linea(sinNumero, "ODOO-NUMERO-SIN-DOCUMENTO")).toBeUndefined();
  });

  it("«no existe» espera al espejo; una nota de crédito ya está en el espejo y no espera", () => {
    const reciente = cobro({ id: "r", fechaEmision: "2026-08-30", numeroFactura: "FAC/2026/0400" });
    expect(linea(lista([reciente]), "ODOO-NUMERO-SIN-DOCUMENTO")).toBeUndefined();

    const nota = factura({ id: "nc", numero: "NC/2026/0001", moveType: "out_refund", invoiceDate: "2026-08-30" });
    const l = linea(
      lista([reciente, cobro({ id: "n", fechaEmision: "2026-08-30", numeroFactura: "NC/2026/0001" })], [nota]),
      "ODOO-NUMERO-SIN-DOCUMENTO",
    );
    expect(l?.items.map((i) => i.nota?.split(" · ")[1])).toEqual(["es una nota de crédito, no una factura"]);
    expect(l?.detalle).toContain("No se cuentan 1 cobro(s) con un número que la copia de Odoo todavía no pudo ver");
  });

  it("⛔ si el espejo nunca corrió bien, «no existe» no se afirma", () => {
    expect(linea(lista([cobro({ numeroFactura: "FAC/2026/0295" })], [], { ultimaCorridaOk: null }), "ODOO-NUMERO-SIN-DOCUMENTO")).toBeUndefined();
  });

  it("«el número es de otro cliente de Odoo»: con atajo a Emparejar y la cuenta con la que está emparejado", () => {
    const ajena = factura({ id: "f", numero: "FAC/2026/0276", cuentaId: "cta2", odooPartnerNombre: "ELECTROCARIBE S.A.", montoNeto: 90 });
    const l = lista([cobro({ monto: 45, numeroFactura: "FAC/2026/0276" })], [ajena]);
    const otro = linea(l, "ODOO-NUMERO-DE-OTRO-CLIENTE");
    expect(otro?.severidad).toBe("ALTA");
    expect(otro?.atajo?.tab).toBe("emparejar");
    expect(otro?.items[0]?.nota).toContain("es de ELECTROCARIBE S.A., emparejado con Electrocaribe");
    expect(linea(l, "ODOO-NUMERO-SIN-DOCUMENTO")).toBeUndefined();
    expect(linea(l, "ODOO-COBRO-SIN-FACTURA")).toBeUndefined();
  });

  it("sin atribuir no se acusa: se cuenta en ODOO-SIN-CUENTA, que es donde se arregla", () => {
    /* Judesur: FAC/2026/0330 por ₡704.563 existe en el espejo, pero su cliente de Odoo sin cuenta. */
    const suelta = factura({ id: "s", numero: "FAC/2026/0330", cuentaId: null, moneda: "CRC", montoNeto: 704563 });
    const l = lista([cobro({ moneda: "CRC", monto: 704563, numeroFactura: "FAC/2026/0330" })], [suelta]);
    expect(linea(l, "ODOO-NUMERO-SIN-DOCUMENTO")).toBeUndefined();
    expect(linea(l, "ODOO-NUMERO-DE-OTRO-CLIENTE")).toBeUndefined();
    expect(linea(l, "ODOO-COBRO-SIN-FACTURA")).toBeUndefined();
    expect(linea(l, "ODOO-SIN-CUENTA")?.detalle).toContain("1 cobro(s) ya tienen anotado el número de una de estas facturas");
  });

  it("⛔ una cuenta Mercury no genera ninguna línea por el número de sus cobros", () => {
    const l = lista(
      [
        cobro({ id: "m1", cuentaId: "merc", numeroFactura: "FAC/2026/0999" }),
        cobro({ id: "m2", cuentaId: "merc", numeroFactura: "INV-16" }),
        cobro({ id: "m3", cuentaId: "merc", numeroFactura: "FAC/2026/0001" }),
      ],
      [factura({ id: "x", numero: "FAC/2026/0999", cuentaId: "cta2" })],
    );
    for (const codigo of ["ODOO-NUMERO-SIN-DOCUMENTO", "ODOO-NUMERO-DE-OTRO-CLIENTE", "ODOO-COBRO-SIN-FACTURA", "CUENTA-INTERNACIONAL-EN-ODOO"]) {
      expect(linea(l, codigo), codigo).toBeUndefined();
    }
  });

  it("un INV-x en una cuenta de Odoo va como evidencia en CUENTA-INTERNACIONAL-EN-ODOO, sin cambiar la huella", () => {
    const cuentas = [
      { id: "wx", nombre: "Wherex", tipo: "INTERNACIONAL", viaCobro: "ODOO" },
      { id: "cta1", nombre: "Seléctrica", tipo: "NACIONAL", viaCobro: "ODOO" },
    ];
    const extra = { cuentas, cuentasVinculadas: new Set<string>(["wx", "cta1"]) };
    const wherex = cobro({ id: "w", cuentaId: "wx", cuentaNombre: "Wherex" });
    const sin = lista([wherex], [], extra);
    const con = lista([{ ...wherex, numeroFactura: "INV-4-1" }], [], extra);
    const lSin = linea(sin, "CUENTA-INTERNACIONAL-EN-ODOO");
    const lCon = linea(con, "CUENTA-INTERNACIONAL-EN-ODOO");
    if (!lSin || !lCon) throw new Error("falta la línea CUENTA-INTERNACIONAL-EN-ODOO");
    expect(lCon.items[0]?.nota).toBe(
      "internacional · vía de cobro: Odoo (por defecto) · ninguna factura en Odoo · ⚠ tiene facturas con número de Mercury: INV-4-1",
    );
    /* Una línea ya aceptada no se reabre solo por anotar un número. */
    expect(huellaDe(lCon)).toBe(huellaDe(lSin));
    expect(lCon.titulo).toBe(lSin.titulo);
    /* Y no se acusa como «cobro sin factura»: su factura está en Mercury. */
    expect(linea(sin, "ODOO-COBRO-SIN-FACTURA")).toBeDefined();
    expect(linea(con, "ODOO-COBRO-SIN-FACTURA")).toBeUndefined();

    /* Una cuenta nacional con esa misma evidencia entra a la línea. */
    const nacional = linea(lista([cobro({ numeroFactura: "INV-16" })], [], extra), "CUENTA-INTERNACIONAL-EN-ODOO");
    expect(nacional?.items.map((i) => i.texto)).toEqual(["Seléctrica", "Wherex"]);
    expect(nacional?.titulo).toBe("2 cuentas dicen facturar por Odoo y puede que no lo hagan");
  });

  it("la lista no cambia cuando el número dice lo mismo que ya apareaba el monto", () => {
    const a = cobro({ id: "a", monto: 2000 });
    const b = cobro({ id: "b", monto: 1800, fechaProgramada: "2026-08-15", fechaEmision: "2026-08-10" });
    const facturas = [
      factura({ id: "fa", odooMoveId: 1, numero: "FAC/2026/0001", montoNeto: 2000 }),
      factura({ id: "fb", odooMoveId: 2, numero: "FAC/2026/0002", montoNeto: 1500, invoiceDate: "2026-08-12" }),
      factura({ id: "fc", odooMoveId: 3, numero: "FAC/2026/0003", montoNeto: 999, invoiceDate: "2026-08-20" }),
    ];
    const conNumero = [
      { ...a, numeroFactura: "FAC/2026/0001" },
      { ...b, numeroFactura: "FAC/2026/0002" },
    ];
    const antes = lista([a, b], facturas);
    expect(antes.map((i) => i.codigo)).toEqual(expect.arrayContaining(["ODOO-MONTO", "ODOO-FACTURA-SIN-COBRO"]));
    expect(lista(conNumero, facturas)).toEqual(antes);
  });
});

/**
 * ── ⭐ 2026-09-13 · CADA MONTO CON SU MONEDA, CADA DOCUMENTO UNA VEZ ───────────────
 * Medido ese día contra la copia de Odoo de producción: el encabezado decía «121 693 746» sumando
 * colones con dólares, contaba dos veces ₡26 millones y dejaba afuera US$543.281, y cada tarjeta
 * mostraba un número sin moneda.
 */
describe("⭐ la plata va por moneda y cada documento se cuenta una vez", () => {
  const cuentas = [{ id: "cta1", nombre: "Selvatura", tipo: "NACIONAL", viaCobro: "ODOO" }];
  const base = { ...alDia, cuentasSinVinculo: 0, cuentasTotales: 1, liberaciones: [], cuentas, aceptadas: new Map<string, string>() };

  it("el encabezado suma cada moneda aparte y cuenta una vez la factura que miran dos líneas", () => {
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "u", odooMoveId: 1, cuentaId: null, odooPartnerId: 77, montoNeto: 5000, moneda: "USD", paymentState: "not_paid" }),
        factura({ id: "c", odooMoveId: 2, cuentaId: null, odooPartnerId: 77, montoNeto: 5000, moneda: "CRC", paymentState: "not_paid" }),
        factura({ id: "x", odooMoveId: 3, cuentaId: null, odooPartnerId: 8, montoNeto: 704563, moneda: "CRC", paymentState: "not_paid" }),
      ],
    });
    const resumen = resumenDeDiferencias(lista);
    expect(resumen.plata).toEqual([
      { moneda: "USD", monto: 5000 },
      { moneda: "CRC", monto: 709563 },
    ]);
    expect(resumen.documentos).toBe(3);
  });

  it("una línea aceptada no suma al encabezado", () => {
    const facturas = [factura({ id: "a", cuentaId: null, paymentState: "not_paid" })];
    const antes = detectarDiferenciasOdoo({ ...base, cobros: [], facturas });
    const sinCuenta = antes.find((i) => i.codigo === "ODOO-SIN-CUENTA");
    if (!sinCuenta) throw new Error("falta la línea sin cuenta");
    const despues = detectarDiferenciasOdoo({ ...base, cobros: [], facturas, aceptadas: new Map([["ODOO-SIN-CUENTA", huellaDe(sinCuenta)]]) });
    expect(resumenDeDiferencias(antes).plata).toEqual([{ moneda: "USD", monto: 2000 }]);
    expect(resumenDeDiferencias(despues).plata).toEqual([]);
  });

  it("textoDeMontos pone cada cifra con su moneda, dólares primero, y nunca las suma", () => {
    expect(textoDeMontos([{ moneda: "USD", monto: 27420 }, { moneda: "CRC", monto: 72493913.64 }])).toBe("US$27.420 + ₡72.493.913,64");
    expect(
      montosPorMoneda([
        { moneda: "CRC", monto: 1 },
        { moneda: "USD", monto: 2 },
        { moneda: "USD", monto: 0.1 },
      ]),
    ).toEqual([
      { moneda: "USD", monto: 2.1 },
      { moneda: "CRC", monto: 1 },
    ]);
  });

  it("ordena por severidad antes que por plata: una exenta en colones no queda arriba de un cobro sin factura", () => {
    /* Medido: «exentas» (baja, ₡1,8 millones) quedaba arriba de «cobros sin factura» (alta, US$27.420)
       porque se comparaban colones con dólares. */
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [cobro({ monto: 500, fechaEmision: "2026-07-15" })],
      facturas: [factura({ invoiceDate: "2026-03-01", montoNeto: 1830000, montoImpuesto: 0, moneda: "CRC" })],
    });
    const codigos = lista.map((i) => i.codigo);
    expect(codigos.indexOf("ODOO-COBRO-SIN-FACTURA")).toBeGreaterThanOrEqual(0);
    expect(codigos.indexOf("ODOO-COBRO-SIN-FACTURA")).toBeLessThan(codigos.indexOf("ODOO-EXENTAS"));
  });

  it("exentas: solo las del año, y lo que mueve es el impuesto que faltaría", () => {
    const l = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "e1", odooMoveId: 1, cuentaId: null, invoiceDate: "2026-03-01", montoNeto: 1830000, montoImpuesto: 0, moneda: "CRC" }),
        factura({ id: "e2", odooMoveId: 2, cuentaId: null, invoiceDate: "2021-03-01", montoNeto: 500, montoImpuesto: 0 }),
      ],
    }).find((i) => i.codigo === "ODOO-EXENTAS");
    expect(l?.titulo).toBe("1 facturas de 2026 salieron sin impuesto");
    expect(l?.montos).toEqual([{ moneda: "CRC", monto: 237900 }]);
    expect(l?.detalle).toContain("No se cuentan 1 de años anteriores");
    expect(l?.detalle).not.toContain("costarricenses");
  });

  it("una cuenta sin cobros: sus facturas pagadas de años anteriores son historia; la de este año cuenta", () => {
    /* JUDESUR: ₡21,2 millones de 2024 y 2025 ya pagados eran el 97 % de la línea. */
    const l = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "v", odooMoveId: 1, numero: "FAC/2024/0010", invoiceDate: "2024-12-01", moneda: "CRC", montoNeto: 17000000 }),
        factura({ id: "n", odooMoveId: 2, numero: "FAC/2026/0330", invoiceDate: "2026-08-20", moneda: "CRC", montoNeto: 704563, paymentState: "not_paid" }),
      ],
    }).find((i) => i.codigo === "ODOO-FACTURA-SIN-COBRO");
    expect(l?.items.map((i) => i.nota)).toEqual(["FAC/2026/0330 · 2026-08-20 · sin pagar"]);
    expect(l?.montos).toEqual([{ moneda: "CRC", monto: 704563 }]);
  });

  it("una factura pagada en parte suma lo que falta cobrar, no el neto entero (MTS FAC/2025/0186, 2026-09-14)", () => {
    const l = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        factura({ id: "p", odooMoveId: 1, numero: "FAC/2026/0186", invoiceDate: "2026-08-15", montoNeto: 1140, montoTotal: 1288.2, montoResidual: 644.1, paymentState: "partial" }),
      ],
    }).find((i) => i.codigo === "ODOO-FACTURA-SIN-COBRO");
    expect(l?.montos).toEqual([{ moneda: "USD", monto: 570 }]);
    expect(l?.plata).toEqual([{ clave: "f:p", moneda: "USD", monto: 570 }]);
    expect(comoSeLeen(l?.items)).toEqual([
      { texto: "INVERSIONES TURISTICAS MONTEVERDE SOCIEDAD ANONIMA — US$570", monto: 570, moneda: "USD", nota: "FAC/2026/0186 · 2026-08-15 · pagada en parte de US$1.140" },
    ]);
  });

  it("⛔ ningún texto que se lee dice in_payment, espejo, sync ni viaCobro", () => {
    const lista = detectarDiferenciasOdoo({
      ...base,
      cuentas: [...cuentas, { id: "wx", nombre: "Wherex", tipo: "INTERNACIONAL", viaCobro: "ODOO" }],
      cobros: [cobro({ monto: 700, fechaEmision: "2026-07-01" }), cobro({ id: "w", cuentaId: "wx", cuentaNombre: "Wherex" })],
      facturas: [
        factura({ id: "p", odooMoveId: 1, cuentaId: null, paymentState: "in_payment", invoiceDate: "2026-01-10" }),
        factura({ id: "s1", odooMoveId: 2, odooPartnerId: 61, montoNeto: 90, moneda: "CRC", paymentState: "not_paid" }),
        factura({ id: "s2", odooMoveId: 3, odooPartnerId: 61, montoNeto: 90, moneda: "USD", paymentState: "not_paid" }),
        factura({ id: "ex", odooMoveId: 4, montoImpuesto: 0, montoNeto: 400, invoiceDate: "2026-02-01" }),
      ],
      liberaciones: [liberada({ referenciaExterna: null })],
    });
    expect(lista.length).toBeGreaterThan(4);
    for (const l of lista) {
      const texto = [l.titulo, l.detalle, ...l.pasos, l.queSignificaAceptar, l.queHacer, l.pie ?? "", ...l.items.flatMap((i) => [i.texto, i.nota ?? ""])].join(" ");
      expect(texto, l.codigo).not.toMatch(/in_payment|not_paid|espejo|\bsync\b|viaCobro/);
    }
  });
});

describe("⭐ la moneda equivocada ya corregida y las notas de crédito sin aplicar, cada una en su línea", () => {
  const base = { ...alDia, cuentasSinVinculo: 0, cuentasTotales: 1, liberaciones: [], cuentas: [], aceptadas: new Map<string, string>() };
  const publimark = (p: Partial<FacturaParaCruzar>) =>
    factura({ odooPartnerId: 75, odooPartnerNombre: "PUBLIMARK SOCIEDAD ANONIMA", cuentaId: null, montoNeto: 11541250, montoTotal: 13041612.5, ...p });

  it("Publimark: la factura en dólares revertida con su nota sale entera, y no escondida entre «notas que no suman»", () => {
    /* Hasta el 2026-09-13 era media frase de otra línea: «notas de crédito por USD 11.595.963,50 que no
       suman», que se leía como un error vivo de once millones de dólares. */
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [
        publimark({ id: "p1", odooMoveId: 232, numero: "FAC/2026/0232", moneda: "USD", paymentState: "reversed" }),
        publimark({ id: "p2", odooMoveId: 233, numero: "FAC/2026/0233", moneda: "CRC", paymentState: "paid" }),
        publimark({ id: "p3", odooMoveId: 243, numero: "FAC/2026/0243", moneda: "USD", moveType: "out_refund", paymentState: "paid" }),
      ],
    });
    const l = lista.find((i) => i.codigo === "ODOO-MONEDA-CORREGIDA");
    expect(comoSeLeen(l?.items)).toEqual([
      {
        texto: "PUBLIMARK SOCIEDAD ANONIMA — FAC/2026/0232 en dólares por US$11.541.250",
        monto: 11541250,
        moneda: "USD",
        nota: "revertida con FAC/2026/0243 · la buena: FAC/2026/0233, en colones",
      },
    ]);
    /* La fila junta tres documentos —la revertida, su nota y la buena— y la marca queda en cada uno. */
    expect(l?.items[0]?.fila.documentos.map((d) => d.clave).sort()).toEqual(["f:p1", "f:p2", "f:p3"]);
    expect(l?.plata).toEqual([]);
    const sinCuenta = lista.find((i) => i.codigo === "ODOO-SIN-CUENTA");
    expect(sinCuenta?.detalle).not.toMatch(/nota\(s\) de crédito por/);
    expect(sinCuenta?.detalle).toContain("va en su propia línea");
    expect(lista.map((i) => i.codigo)).not.toContain("ODOO-MONEDA");
  });

  it("una nota sin aplicar dice qué factura parece anular, y esa factura suma una sola vez", () => {
    const dePublimark = { moneda: "USD", montoNeto: 13475, montoTotal: 15226.75, montoResidual: 15226.75, paymentState: "not_paid", invoiceDate: "2026-02-20" };
    const f210 = publimark({ id: "f210", odooMoveId: 210, numero: "FAC/2026/0210", ...dePublimark });
    const n246 = publimark({ id: "n246", odooMoveId: 246, numero: "FAC/2026/0246", moveType: "out_refund", ...dePublimark });
    const lista = detectarDiferenciasOdoo({ ...base, cobros: [], facturas: [f210, n246] });
    const l = lista.find((i) => i.codigo === "ODOO-NOTA-SIN-APLICAR");
    expect(l?.severidad).toBe("ALTA");
    expect(l?.items[0]?.nota).toBe("2026-02-20 · parece anular FAC/2026/0210, que Odoo sigue dando por cobrar");
    expect(l?.plata).toEqual([{ clave: "f:f210", moneda: "USD", monto: 13475 }]);
    expect(resumenDeDiferencias(lista).plata).toEqual([{ moneda: "USD", monto: 13475 }]);
  });

  it("Syntepro: el par en dos monedas cuya factura en colones ya tiene su nota deja de ser «dos monedas»", () => {
    const syn = (p: Partial<FacturaParaCruzar>) =>
      factura({ odooPartnerId: 40, odooPartnerNombre: "SYNTEPRO", cuentaId: null, montoNeto: 829, montoTotal: 936.77, ...p });
    const filas = [
      syn({ id: "crc", odooMoveId: 149, numero: "FAC/2025/0149", moneda: "CRC", paymentState: "not_paid", montoResidual: 936.77 }),
      syn({ id: "usd", odooMoveId: 150, numero: "FAC/2025/0150", moneda: "USD" }),
      syn({ id: "nc", odooMoveId: 251, numero: "FAC/2025/0251", moneda: "CRC", moveType: "out_refund", paymentState: "not_paid", montoResidual: 936.77 }),
    ];
    expect(montosEnDosMonedas(filas)).toEqual([]);
    const lista = detectarDiferenciasOdoo({ ...base, cobros: [], facturas: filas });
    expect(lista.map((i) => i.codigo)).not.toContain("ODOO-MONEDA");
    expect(lista.find((i) => i.codigo === "ODOO-NOTA-SIN-APLICAR")?.items[0]?.nota).toContain("parece anular FAC/2025/0149");
  });
});

/**
 * ── ⭐ 2026-09-13 · UNA FACTURA DE VARIAS CUOTAS NO ES UN MONTO DISTINTO ─────────
 * Medido ese día: de los US$24.876 de «montos distintos», US$40 eran un monto distinto de verdad, y 14 de los
 * 21 «cobros sin factura» tenían la suya, que cubría varias cuotas. ⛔ La línea nueva PROPONE: el cruce no
 * junta nada por monto, y el número lo anota una persona.
 */
describe("⭐ facturas que cubren varias cuotas: se proponen, no se juntan", () => {
  const cuentas = [{ id: "cta1", nombre: "ALMOTEC", tipo: "NACIONAL", viaCobro: "ODOO" }];
  const base = { ...alDia, cuentasSinVinculo: 0, cuentasTotales: 1, liberaciones: [], cuentas, aceptadas: new Map<string, string>() };
  const almotec = ["2026-06", "2026-07", "2026-08"].map((periodo, i) =>
    cobro({ id: `al${i + 1}`, cuentaNombre: "ALMOTEC", periodo, fechaProgramada: `${periodo}-15`, monto: 2300, fechaEmision: `${periodo}-10` }),
  );
  const f329 = factura({ id: "f329", odooMoveId: 329, numero: "FAC/2026/0329", invoiceDate: "2026-08-12", montoNeto: 6900, paymentState: "not_paid" });

  it("ALMOTEC: 3 × 2.300 contra 6.900 es una factura de 3 cuotas, no un monto distinto ni dos cobros sin factura", () => {
    const lista = detectarDiferenciasOdoo({ ...base, cobros: almotec, facturas: [f329] });
    const l = lista.find((i) => i.codigo === "ODOO-FACTURA-VARIAS-CUOTAS");
    expect(comoSeLeen(l?.items)).toEqual([
      {
        texto: "ALMOTEC — FAC/2026/0329 por US$6.900",
        monto: 6900,
        moneda: "USD",
        nota: "cubre 3 cuotas: 2026-06 US$2.300 + 2026-07 US$2.300 + 2026-08 US$2.300 · sin pagar",
      },
    ]);
    /* La fila es la factura; sus tres cuotas van dentro de su huella: si se va una, la propuesta ya es otra. */
    expect(l?.items[0]?.fila.documentos.map((d) => d.clave)).toEqual(["f:f329"]);
    for (const c of almotec) expect(l?.items[0]?.fila.huella).toContain(`c:${c.id}=`);
    expect(l?.plata).toEqual([]);
    const codigos = lista.map((i) => i.codigo);
    expect(codigos).not.toContain("ODOO-MONTO");
    expect(codigos).not.toContain("ODOO-COBRO-SIN-FACTURA");
    expect(cruzar(almotec, [f329]).pares, "⛔ el cruce no las junta").toEqual([]);
  });

  it("Iberorutas: la factura de mayo + junio suelta la cuota de 150, que vuelve a ser un cobro sin factura", () => {
    const cobros = [
      cobro({ id: "c150", cuentaNombre: "Iberorutas", periodo: "2026-06", fechaProgramada: "2026-06-01", monto: 150, fechaEmision: "2026-06-01" }),
      cobro({ id: "may", cuentaNombre: "Iberorutas", periodo: "2026-05", fechaProgramada: "2026-05-15", monto: 3550, fechaEmision: "2026-05-10" }),
      cobro({ id: "jun", cuentaNombre: "Iberorutas", periodo: "2026-06", fechaProgramada: "2026-06-15", monto: 3550, fechaEmision: "2026-06-10" }),
    ];
    const f328 = factura({ id: "f328", odooMoveId: 328, numero: "FAC/2026/0328", invoiceDate: "2026-07-10", montoNeto: 7100, paymentState: "not_paid" });
    expect(cruzar(cobros, [f328]).montosDistintos.map((d) => d.cobroId), "así estaba: 150 contra 7.100").toEqual(["c150"]);
    const lista = detectarDiferenciasOdoo({ ...base, cobros, facturas: [f328] });
    expect(lista.find((i) => i.codigo === "ODOO-FACTURA-VARIAS-CUOTAS")?.items[0]?.nota).toMatch(
      /^cubre 2 cuotas: 2026-05 US\$3\.550 \+ 2026-06 US\$3\.550/,
    );
    expect(lista.find((i) => i.codigo === "ODOO-COBRO-SIN-FACTURA")?.items.map((i) => i.texto)).toEqual(["Iberorutas — US$150"]);
    expect(lista.map((i) => i.codigo)).not.toContain("ODOO-MONTO");
  });

  it("⛔ con dos combinaciones posibles no propone nada", () => {
    const cuatro = [...almotec, cobro({ id: "al4", periodo: "2026-09", fechaProgramada: "2026-09-15", monto: 2300, fechaEmision: "2026-09-01" })];
    expect(facturasDeVariasCuotas([f329], cuatro)).toEqual([]);
  });

  it("⛔ una cuota con número ya dijo cuál es su factura: no entra", () => {
    const conNumero = almotec.map((c, i) => (i === 0 ? { ...c, numeroFactura: "FAC/2026/0300" } : c));
    expect(facturasDeVariasCuotas([f329], conNumero)).toEqual([]);
  });

  it("Ecoquintas: dos servicios facturados juntos cada mes; manda la fecha de emisión, después el mes, después el mes vencido", () => {
    const cuota = (id: string, periodo: string, monto: number, fechaEmision: string) =>
      cobro({ id, cuentaNombre: "Ecoquintas", periodo, fechaProgramada: `${periodo}-28`, monto, fechaEmision });
    const cobros = [
      cuota("feb1300", "2026-02", 1300, "2026-02-28"),
      cuota("mar1880", "2026-03", 1880, "2026-03-30"),
      cuota("apr1300", "2026-04", 1300, "2026-04-30"),
      cuota("apr1880", "2026-04", 1880, "2026-04-30"),
      cuota("may1300", "2026-05", 1300, "2026-05-30"),
      cuota("may1880", "2026-05", 1880, "2026-05-30"),
      cuota("jun1300", "2026-06", 1300, "2026-09-03"),
      cuota("jun1880", "2026-06", 1880, "2026-09-03"),
    ];
    const de3180 = (numero: string, invoiceDate: string, odooMoveId: number) =>
      factura({ id: numero, odooMoveId, numero, invoiceDate, montoNeto: 3180 });
    const facturas = [
      de3180("FAC/2026/0216", "2026-02-16", 216),
      de3180("FAC/2026/0271", "2026-04-22", 271),
      de3180("FAC/2026/0292", "2026-06-08", 292),
      de3180("FAC/2026/0336", "2026-09-03", 336),
    ];
    expect(facturasDeVariasCuotas(facturas, cobros).map((v) => [v.factura.numero, v.cobros.map((c) => c.id)])).toEqual([
      ["FAC/2026/0216", ["feb1300", "mar1880"]],
      ["FAC/2026/0271", ["apr1300", "apr1880"]],
      ["FAC/2026/0292", ["may1300", "may1880"]],
      ["FAC/2026/0336", ["jun1300", "jun1880"]],
    ]);
  });

  it("Honda: el monto exacto junta primero lo más cercano, y la factura de mayo + junio queda con mayo y junio", () => {
    const honda = ["2026-05", "2026-06", "2026-07", "2026-08"].map((periodo, i) =>
      cobro({ id: `h${i + 5}`, cuentaNombre: "Honda", periodo, fechaProgramada: `${periodo}-15`, monto: 500, estado: "COBRADO", fechaEmision: null }),
    );
    const facturas = [
      factura({ id: "f311", odooMoveId: 311, numero: "FAC/2026/0311", invoiceDate: "2026-06-30", montoNeto: 1000 }),
      factura({ id: "f314", odooMoveId: 314, numero: "FAC/2026/0314", invoiceDate: "2026-07-15", montoNeto: 500 }),
      factura({ id: "f325", odooMoveId: 325, numero: "FAC/2026/0325", invoiceDate: "2026-08-15", montoNeto: 500 }),
    ];
    expect(cruzar(honda, facturas).pares.map((p) => [p.cobroId, p.facturaId])).toEqual([
      ["h7", "f314"],
      ["h8", "f325"],
    ]);
    const l = detectarDiferenciasOdoo({ ...base, cobros: honda, facturas }).find((i) => i.codigo === "ODOO-FACTURA-VARIAS-CUOTAS");
    expect(l?.items[0]?.nota).toMatch(/^cubre 2 cuotas: 2026-05 US\$500 \+ 2026-06 US\$500/);
  });

  it("⛔ dos facturas que reclaman la misma cuota: ninguna se propone", () => {
    const otra = factura({ id: "otra", odooMoveId: 330, numero: "FAC/2026/0330", invoiceDate: "2026-08-12", montoNeto: 6900 });
    expect(facturasDeVariasCuotas([f329, otra], almotec)).toEqual([]);
  });
});

describe("montos distintos: el 13 % es el IVA y no se acusa", () => {
  const base = { ...alDia, cuentasSinVinculo: 0, cuentasTotales: 1, liberaciones: [], cuentas: [], aceptadas: new Map<string, string>() };

  it("un cobro que difiere de su factura justo en el 13 % no sale (decisión de Alex del 12-sep)", () => {
    const lista = detectarDiferenciasOdoo({ ...base, cobros: [cobro({ monto: 2655.5 })], facturas: [factura({ montoNeto: 2350 })] });
    expect(lista.map((i) => i.codigo)).not.toContain("ODOO-MONTO");
  });

  it("uno de verdad sí, y la diferencia va con su moneda", () => {
    const l = detectarDiferenciasOdoo({ ...base, cobros: [cobro({ monto: 420 })], facturas: [factura({ montoNeto: 440 })] }).find(
      (i) => i.codigo === "ODOO-MONTO",
    );
    expect(l?.montos).toEqual([{ moneda: "USD", monto: 20 }]);
    expect(l?.items[0]?.nota).toBe("factura FAC/2026/0001 · Odoo dice más: US$20");
  });
});

describe("una factura soltada sin número dice lo que se encontró en Odoo", () => {
  const base = { ...alDia, cuentasSinVinculo: 0, cuentasTotales: 1, cuentas: [], aceptadas: new Map<string, string>() };

  it("Honda: parece la factura ya revertida; Kaizen: su cliente no tiene ninguna factura en Odoo", () => {
    const honda = liberada({ id: "h", cuentaId: "honda", clienteNombre: "Honda", monto: 500, referenciaExterna: null, fechaEmision: "2026-09-05", periodo: "2026-09" });
    const kaizen = liberada({ id: "k", cuentaId: "kaizen", clienteNombre: "Kaizen", monto: 21501, referenciaExterna: null });
    const facturas = [
      factura({ id: "f340", odooMoveId: 340, numero: "FAC/2026/0340", cuentaId: "honda", invoiceDate: "2026-09-04", montoNeto: 500, paymentState: "reversed" }),
      factura({ id: "nc18", odooMoveId: 918, numero: "NC/2026/0018", cuentaId: "honda", invoiceDate: "2026-09-10", montoNeto: 500, moveType: "out_refund" }),
    ];
    const l = detectarDiferenciasOdoo({ ...base, cobros: [], facturas, liberaciones: [honda, kaizen] }).find(
      (i) => i.codigo === "ODOO-LIBERADAS-SIN-NUMERO",
    );
    const notaDe = (id: string) => l?.items.find((i) => i.id === id)?.nota ?? "";
    expect(notaDe("h")).toContain("parece ser FAC/2026/0340, ya revertida con NC/2026/0018: si es esa, marcala resuelta");
    expect(notaDe("k")).toContain("este cliente no tiene ninguna factura en Odoo");
  });
});

/**
 * ── ⭐ 2026-09-14 · LO QUE LA PÁGINA ESCONDÍA DESPUÉS DE CARGAR EL EXCEL DE ALEXANDER ─────────
 * Medido en producción ese día, en solo lectura: 4 cobros por cobrar con su factura pagada en Odoo (US$4.626), 6
 * cobrados con la suya sin pagar (US$6.730, sobre todo TEC-AE), TEC-AE FAC/2026/0298 (US$4.860) en ninguna línea,
 * ACCCSA acusada de no tener factura cuando el Excel la trae por Mercury, y Hotel Alta Las Palomas sin decir que su
 * factura se revirtió. Los casos son esos, con sus números.
 */
describe("⭐ lo que «Lo que no cuadra» escondía después de cargar el Excel de Alexander", () => {
  const cuentas = [
    { id: "gs", nombre: "Global Supply S.A", tipo: "NACIONAL", viaCobro: "ODOO" },
    { id: "aprecap", nombre: "APRECAP", tipo: "NACIONAL", viaCobro: "ODOO" },
    { id: "tec", nombre: "TEC- AE", tipo: "NACIONAL", viaCobro: "ODOO" },
    { id: "juanva", nombre: "Transportes Juanva", tipo: "NACIONAL", viaCobro: "ODOO" },
    { id: "acccsa", nombre: "ACCCSA", tipo: "NACIONAL", viaCobro: "ODOO" },
    { id: "palomas", nombre: "Hotel Alta Las Palomas", tipo: "NACIONAL", viaCobro: "ODOO" },
  ];
  const base = {
    ...alDia,
    cuentasVinculadas: new Set(cuentas.map((c) => c.id)),
    /* ⇒ corte = 2026-08-29. */
    ultimaCorridaOk: "2026-09-13",
    cuentasSinVinculo: 0,
    cuentasTotales: cuentas.length,
    liberaciones: [],
    cuentas,
    aceptadas: new Map<string, string>(),
  };
  const sinPagar = (p: Partial<FacturaParaCruzar> & Pick<FacturaParaCruzar, "montoNeto">) => {
    const total = p.montoTotal ?? Math.round(p.montoNeto * 113) / 100;
    return factura({ paymentState: "not_paid", ...p, montoTotal: total, montoResidual: total });
  };
  const linea = (l: DiferenciaOdoo[], codigo: string) => l.find((i) => i.codigo === codigo);

  /* Global Supply 0323 (cargada por la corrida) y APRECAP 0326: por cobrar o programada en Nexus, pagada en Odoo. */
  const gs = cobro({ id: "gs-ago", cuentaId: "gs", cuentaNombre: "Global Supply S.A", periodo: "2026-08", fechaProgramada: "2026-08-07", fechaEmision: "2026-08-07", monto: 3396, numeroFactura: "FAC/2026/0323" });
  const f323 = factura({ id: "f323", odooMoveId: 323, numero: "FAC/2026/0323", cuentaId: "gs", odooPartnerId: 11, invoiceDate: "2026-08-07", montoNeto: 3396 });
  const aprecap = cobro({ id: "aprecap-sep", cuentaId: "aprecap", cuentaNombre: "APRECAP", periodo: "2026-09", fechaProgramada: "2026-09-15", fechaEmision: null, estado: "PROGRAMADO", monto: 65 });
  const f326 = factura({ id: "f326", odooMoveId: 326, numero: "FAC/2026/0326", cuentaId: "aprecap", odooPartnerId: 12, invoiceDate: "2026-09-01", montoNeto: 65, paymentState: "in_payment" });

  /* TEC-AE: cuatro cuotas cobradas; en Odoo, cuatro facturas sin pagar y una nota de crédito sin aplicar. */
  const tecNombre = "FUNDACION TECNOLÓGICA DE COSTA RICA";
  const tec = [
    cobro({ id: "tec-02", cuentaId: "tec", cuentaNombre: "TEC- AE", periodo: "2026-02", fechaProgramada: "2026-02-15", fechaEmision: "2026-02-15", monto: 3240, estado: "COBRADO", numeroFactura: "FAC/2026/0218" }),
    ...["03", "04", "05"].map((m) =>
      cobro({ id: `tec-${m}`, cuentaId: "tec", cuentaNombre: "TEC- AE", periodo: `2026-${m}`, fechaProgramada: `2026-${m}-15`, fechaEmision: `2026-${m}-15`, monto: 1620, estado: "COBRADO" }),
    ),
  ];
  const deTec = { cuentaId: "tec", odooPartnerId: 20, odooPartnerNombre: tecNombre };
  const tecFacturas = [
    sinPagar({ ...deTec, id: "f200", odooMoveId: 200, numero: "FAC/2026/0200", invoiceDate: "2026-02-02", montoNeto: 1620, montoTotal: 1652.4 }),
    sinPagar({ ...deTec, id: "f218", odooMoveId: 218, numero: "FAC/2026/0218", invoiceDate: "2026-02-10", montoNeto: 3240, montoTotal: 3304.8 }),
    sinPagar({ ...deTec, id: "f272", odooMoveId: 272, numero: "FAC/2026/0272", invoiceDate: "2026-04-22", montoNeto: 3240, montoTotal: 3304.8 }),
    sinPagar({ ...deTec, id: "f298", odooMoveId: 298, numero: "FAC/2026/0298", invoiceDate: "2026-06-15", montoNeto: 4860, montoTotal: 4957.2 }),
    sinPagar({ ...deTec, id: "n242", odooMoveId: 242, numero: "FAC/2026/0242", invoiceDate: "2026-02-26", montoNeto: 1620, montoTotal: 1652.4, moveType: "out_refund" }),
  ];

  /* Transportes Juanva: la cuota de enero cobrada, juntada por monto con una factura exenta sin pagar; y dos de 2025. */
  const deJuanva = { cuentaId: "juanva", odooPartnerId: 30, odooPartnerNombre: "TRANSPORTES JUANVA SOCIEDAD ANONIMA" };
  const juanva = cobro({ id: "juanva-01", cuentaId: "juanva", cuentaNombre: "Transportes Juanva", periodo: "2026-01", fechaProgramada: "2026-01-15", fechaEmision: "2026-01-15", monto: 500, estado: "COBRADO" });
  const juanvaFacturas = [
    sinPagar({ ...deJuanva, id: "f197", odooMoveId: 197, numero: "FAC/2026/0197", invoiceDate: "2026-01-20", montoNeto: 500, montoTotal: 500, montoImpuesto: 0 }),
    sinPagar({ ...deJuanva, id: "f189", odooMoveId: 189, numero: "FAC/2025/0189", invoiceDate: "2025-12-23", montoNeto: 500 }),
    factura({ ...deJuanva, id: "f150", odooMoveId: 150, numero: "FAC/2025/0150", invoiceDate: "2025-09-10", montoNeto: 500 }),
  ];

  /* ACCCSA: cinco cuotas de US$712 cobradas; el Excel trae cuatro facturas de Mercury, atadas por el mes. */
  const acccsa = ["01", "02", "03", "04", "05"].map((m) =>
    cobro({ id: `acccsa-${m}`, cuentaId: "acccsa", cuentaNombre: "ACCCSA", periodo: `2026-${m}`, fechaProgramada: `2026-${m}-15`, fechaEmision: `2026-${m}-15`, monto: 712, estado: "COBRADO" }),
  );
  const filasDelExcel = [2, 10, 20, 28];
  const libro = new Map<string, DocumentoDelLibro>(
    ["01", "02", "03", "04"].map((m, i): [string, DocumentoDelLibro] => [
      `acccsa-${m}`,
      { numero: `INV-4-${i + 1}`, plataforma: "MERCURY", total: 712.5, moneda: "USD", fuente: `«Asientos Contables Mercury Bank» fila ${filasDelExcel[i]}`, porElMes: true },
    ]),
  );

  /* Hotel Alta Las Palomas: la cuota de marzo, marcada facturada en agosto; su factura de marzo está revertida. */
  const palomas = cobro({ id: "palomas-03", cuentaId: "palomas", cuentaNombre: "Hotel Alta Las Palomas", periodo: "2026-03", fechaProgramada: "2026-03-15", fechaEmision: "2026-08-10", monto: 550 });
  const palomasFacturas = [
    factura({ id: "f225", odooMoveId: 225, numero: "FAC/2026/0225", cuentaId: "palomas", odooPartnerId: 13, invoiceDate: "2026-03-05", montoNeto: 550, paymentState: "reversed" }),
    factura({ id: "nc19", odooMoveId: 1019, numero: "NC/2026/0019", cuentaId: "palomas", odooPartnerId: 13, invoiceDate: "2026-09-11", montoNeto: 550, moveType: "out_refund" }),
  ];

  const estado = {
    ...base,
    libro,
    cobros: [gs, aprecap, ...tec, juanva, ...acccsa, palomas],
    facturas: [f323, f326, ...tecFacturas, ...juanvaFacturas, ...palomasFacturas],
  };
  const lista = detectarDiferenciasOdoo(estado);

  it("por cobrar en Nexus y pagada en Odoo: Global Supply 0323 y APRECAP 0326, con la plata de los cobros", () => {
    const l = linea(lista, "ODOO-POR-COBRAR-PAGADA");
    expect(l?.severidad).toBe("ALTA");
    expect(l?.donde).toBe("NEXUS");
    expect(comoSeLeen(l?.items)).toEqual([
      { texto: "Global Supply S.A — FAC/2026/0323 por US$3.396", monto: 3396, moneda: "USD", nota: "2026-08 US$3.396 · por cobrar en Nexus · pagada en Odoo" },
      { texto: "APRECAP — FAC/2026/0326 por US$65", monto: 65, moneda: "USD", nota: "2026-09 US$65 · programado en Nexus · pagada sin conciliar con el banco en Odoo" },
    ]);
    expect(l?.items.map((i) => i.fila.clave)).toEqual(["f:f323", "f:f326"]);
    expect(l?.plata).toEqual([
      { clave: "c:gs-ago", moneda: "USD", monto: 3396 },
      { clave: "c:aprecap-sep", moneda: "USD", monto: 65 },
    ]);
  });

  it("cobrado en Nexus y sin pagar en Odoo: TEC-AE 0218, 0272 y 0200, y Juanva 0197; la factura que anula una nota suma una vez", () => {
    const l = linea(lista, "ODOO-COBRADO-SIN-PAGAR");
    expect(l?.donde).toBe("PREGUNTANDO");
    expect(l?.titulo).toBe("5 cobros en Cobrado con su factura sin pagar en Odoo");
    expect(l?.items.map((i) => [i.texto, i.nota])).toEqual([
      ["TEC- AE — FAC/2026/0218 por US$3.240", "2026-02 US$3.240 · cobrado en Nexus · sin pagar en Odoo"],
      /* ⚠ La propuesta de varias cuotas también: hasta el 2026-09-14 la 0272 estaba solo en «varias cuotas», que no suma
         ni dice que abril y mayo están cobradas. */
      [
        "TEC- AE — FAC/2026/0272 por US$3.240",
        "2026-04 US$1.620 + 2026-05 US$1.620 · cobrado en Nexus · sin pagar en Odoo · ⚠ la factura cubre estas cuotas según la suma: confirmalo al anotarles el número",
      ],
      ["TEC- AE — FAC/2026/0200 por US$1.620", "2026-03 US$1.620 · cobrado en Nexus · sin pagar en Odoo"],
      ["Transportes Juanva — FAC/2026/0197 por US$500", "2026-01 US$500 · cobrado en Nexus · sin pagar en Odoo"],
    ]);
    expect(l?.documentos, "la casa de la 0272 es «varias cuotas»").not.toContain("f:f272");
    expect(l?.plata).toContainEqual({ clave: "f:f272", moneda: "USD", monto: 3240 });
    expect(lista.filter((x) => x.plata.some((p) => p.clave === "f:f200")).map((x) => x.codigo).sort()).toEqual([
      "ODOO-COBRADO-SIN-PAGAR",
      "ODOO-NOTA-SIN-APLICAR",
    ]);
    expect(resumenDeDiferencias(lista).documentos).toBe(new Set(lista.flatMap((x) => x.plata.map((p) => p.clave))).size);
  });

  it("TEC-AE FAC/2026/0298 ya no se cae: el par aproximado con mayo se descarta y la factura vuelve a «sin cobro»", () => {
    expect(cruzar(estado.cobros, estado.facturas).montosDistintos.map((d) => [d.cobroId, d.facturaId]), "así se caía").toContainEqual(["tec-05", "f298"]);
    expect(linea(lista, "ODOO-FACTURA-VARIAS-CUOTAS")?.items.map((i) => i.texto)).toEqual(["TEC- AE — FAC/2026/0272 por US$3.240"]);
    const sinCobro = linea(lista, "ODOO-FACTURA-SIN-COBRO");
    expect(comoSeLeen(sinCobro?.items)).toContainEqual({ texto: `${tecNombre} — US$4.860`, monto: 4860, moneda: "USD", nota: "FAC/2026/0298 · 2026-06-15 · sin pagar" });
    expect(sinCobro?.documentos).toContain("f:f298");
  });

  it("una factura que Odoo sigue dando por cobrar no es historia aunque sea de antes del primer cobro; una pagada sí", () => {
    const notas = linea(lista, "ODOO-FACTURA-SIN-COBRO")?.items.map((i) => i.nota) ?? [];
    expect(notas).toContain("FAC/2025/0189 · 2025-12-23 · sin pagar · de antes del primer cobro que Nexus tiene de la cuenta");
    expect(notas.some((n) => n?.startsWith("FAC/2025/0150"))).toBe(false);
  });

  it("ACCCSA: el Excel la trae por Mercury y no se acusa; la quinta cuota, sin documento en el Excel, sí, avisando", () => {
    const enMercury = linea(lista, "ODOO-COBRO-FACTURADO-EN-MERCURY");
    expect(enMercury?.plata, "la factura existe, en otra plataforma: no suma").toEqual([]);
    expect(enMercury?.items.map((i) => i.nota)).toEqual([
      "2026-01 · cobrado · el Excel: INV-4-1 por US$712,50 («Asientos Contables Mercury Bank» fila 2) · ⚠ atada por el mes: el monto no es el mismo",
      "2026-02 · cobrado · el Excel: INV-4-2 por US$712,50 («Asientos Contables Mercury Bank» fila 10) · ⚠ atada por el mes: el monto no es el mismo",
      "2026-03 · cobrado · el Excel: INV-4-3 por US$712,50 («Asientos Contables Mercury Bank» fila 20) · ⚠ atada por el mes: el monto no es el mismo",
      "2026-04 · cobrado · el Excel: INV-4-4 por US$712,50 («Asientos Contables Mercury Bank» fila 28) · ⚠ atada por el mes: el monto no es el mismo",
    ]);
    const acusadas = linea(lista, "ODOO-COBRO-SIN-FACTURA")?.items.filter((i) => i.texto.startsWith("ACCCSA"));
    expect(acusadas?.map((i) => i.nota)).toEqual([
      "2026-05 · programado 2026-05-15 · cobrado · ⚠ el Excel de Alexander da otras cuotas de esta cuenta facturadas por Mercury: buscala ahí antes de emitirla en Odoo",
    ]);
  });

  it("⛔ la plataforma que anotó una persona manda sobre el Excel", () => {
    const conOdoo = estado.cobros.map((c) => (c.id === "acccsa-01" ? { ...c, plataformaFactura: "ODOO" } : c));
    const l = detectarDiferenciasOdoo({ ...estado, cobros: conOdoo });
    expect(linea(l, "ODOO-COBRO-FACTURADO-EN-MERCURY")?.items).toHaveLength(3);
    expect(linea(l, "ODOO-COBRO-SIN-FACTURA")?.items.filter((i) => i.texto.startsWith("ACCCSA"))).toHaveLength(2);
  });

  /* ⭐ 2026-09-25: «falta anotar el número de Mercury» no depende de Odoo. Hasta ese día solo miraba las cuentas que
     dicen Odoo, y marcar una cuenta «Está en Mercury» le borraba esas filas sin que nadie hubiera anotado nada. */
  it("⭐ una cuenta marcada «Está en Mercury» sigue pidiendo el número de Mercury; la quinta cuota ya no se acusa", () => {
    const conVia = (via: string) => ({ ...estado, cuentas: cuentas.map((c) => (c.id === "acccsa" ? { ...c, viaCobro: via } : c)) });
    const enMercury = detectarDiferenciasOdoo(conVia("MERCURY"));
    expect(linea(enMercury, "ODOO-COBRO-FACTURADO-EN-MERCURY")?.items).toEqual(linea(lista, "ODOO-COBRO-FACTURADO-EN-MERCURY")?.items);
    /* Sin documento en el Excel, la cuota de mayo de una cuenta de Mercury no tiene nada que verificar en Odoo. */
    expect(linea(enMercury, "ODOO-COBRO-SIN-FACTURA")?.items.filter((i) => i.texto.startsWith("ACCCSA"))).toEqual([]);
    /* QuickBooks sigue afuera: el Excel diciendo Mercury ahí es otra contradicción, no un número que falta. */
    expect(linea(detectarDiferenciasOdoo(conVia("OTRA")), "ODOO-COBRO-FACTURADO-EN-MERCURY")).toBeUndefined();
  });

  it("Hotel Alta Las Palomas: la fila dice que su factura se revirtió, aunque la cuota se marcó facturada meses después", () => {
    const fila = linea(lista, "ODOO-COBRO-SIN-FACTURA")?.items.find((i) => i.texto.startsWith("Hotel Alta Las Palomas"));
    expect(fila?.nota).toBe(
      "2026-03 · programado 2026-03-15 · por cobrar · tenía FAC/2026/0225, revertida en Odoo con NC/2026/0019: si la cuota ya no se debe, decidí qué pasa con ella",
    );
  });

  it("⚠ el par de «montos distintos» también: MTS 0280 sale con lo cobrado, y la diferencia de monto se cuenta una sola vez", () => {
    const deMts = { cuentaId: "mts", odooPartnerId: 42, odooPartnerNombre: "MTS MULTISERVICIOS DE COSTA RICA SOCIEDAD ANONIMA" };
    const conMts = {
      ...base,
      cuentas: [{ id: "mts", nombre: "MTS MULTISERVICIOS", tipo: "NACIONAL", viaCobro: "ODOO" }],
      cuentasVinculadas: new Set(["mts"]),
      libro: new Map<string, DocumentoDelLibro>(),
      /* Medido el 2026-09-14: abril cobrado por US$420; FAC/2026/0280 por US$440, sin pagar en Odoo y en el Excel. */
      cobros: [cobro({ id: "mts-04", cuentaId: "mts", cuentaNombre: "MTS MULTISERVICIOS", periodo: "2026-04", fechaProgramada: "2026-04-30", fechaEmision: "2026-04-30", monto: 420, estado: "COBRADO" })],
      facturas: [sinPagar({ ...deMts, id: "f280", odooMoveId: 280, numero: "FAC/2026/0280", invoiceDate: "2026-05-05", montoNeto: 440 })],
    };
    const l = detectarDiferenciasOdoo(conMts);
    const sinPagarL = linea(l, "ODOO-COBRADO-SIN-PAGAR");
    expect(comoSeLeen(sinPagarL?.items)).toEqual([
      {
        texto: "MTS MULTISERVICIOS — FAC/2026/0280 por US$420",
        monto: 420,
        moneda: "USD",
        nota: "2026-04 US$420 · cobrado en Nexus · sin pagar en Odoo · ⚠ Nexus dice US$420 y la factura US$440: la diferencia va en la línea de montos distintos",
      },
    ]);
    expect(sinPagarL?.documentos, "su casa es «montos distintos»").toEqual([]);
    expect(linea(l, "ODOO-MONTO")?.plata).toEqual([{ clave: "m:f280", moneda: "USD", monto: 20 }]);
    expect(resumenDeDiferencias(l).plata, "420 + 20 son los 440 de la factura, no 460").toEqual([{ moneda: "USD", monto: 440 }]);
    expect(coberturaDelCruce(conMts)).toEqual({ facturasSinCasa: [], facturasRepetidas: [], cobrosSinCasa: [], cobrosRepetidos: [] });

    /* Al revés, y con Nexus diciendo más que la factura: por cobrar por US$470 contra una factura pagada de US$440. */
    const porCobrar = { ...conMts.cobros[0], estado: "POR_COBRAR", monto: 470 };
    const pagada = factura({ ...deMts, id: "f280", odooMoveId: 280, numero: "FAC/2026/0280", invoiceDate: "2026-05-05", montoNeto: 440 });
    const l2 = detectarDiferenciasOdoo({ ...conMts, cobros: [porCobrar], facturas: [pagada] });
    expect(linea(l2, "ODOO-POR-COBRAR-PAGADA")?.plata).toEqual([{ clave: "f:f280", moneda: "USD", monto: 440 }]);
    expect(resumenDeDiferencias(l2).plata, "440 + 30 son los 470 que Nexus da por cobrar").toEqual([{ moneda: "USD", monto: 470 }]);
  });

  it("⭐ la cobertura ve el hueco: una factura que ninguna línea nombra y un cobro que está en dos", () => {
    const conHueco = lista.map((l) =>
      l.codigo === "ODOO-FACTURA-SIN-COBRO"
        ? { ...l, documentos: l.documentos.filter((d) => d !== "f:f298") }
        : l.codigo === "ODOO-COBRO-FACTURADO-EN-MERCURY"
          ? { ...l, documentos: [...l.documentos, "c:palomas-03"] }
          : l,
    );
    const c = coberturaDelCruce(estado, conHueco);
    expect(c.facturasSinCasa.map((f) => f.numero)).toEqual(["FAC/2026/0298"]);
    expect(c.cobrosRepetidos.map((x) => [x.cobro.id, x.lineas])).toEqual([["palomas-03", ["ODOO-COBRO-SIN-FACTURA", "ODOO-COBRO-FACTURADO-EN-MERCURY"]]]);
    expect(coberturaDelCruce(estado)).toEqual({ facturasSinCasa: [], facturasRepetidas: [], cobrosSinCasa: [], cobrosRepetidos: [] });
  });

  /* Un estado con casi todas las líneas: lo usan la cobertura y los nombres propios de las filas. */
  const deCuenta = (id: string) => ({ id, nombre: id.toUpperCase(), tipo: "NACIONAL", viaCobro: "ODOO" });
  const mas = ["almotec", "ibero", "mts", "iva", "num", "lib"];
  const todo = {
    ...estado,
    cuentas: [...cuentas, ...mas.map(deCuenta)],
    cuentasVinculadas: new Set([...cuentas.map((c) => c.id), ...mas]),
    cobros: [
      ...estado.cobros,
      ...["06", "07", "08"].map((m) => cobro({ id: `al-${m}`, cuentaId: "almotec", periodo: `2026-${m}`, fechaProgramada: `2026-${m}-15`, fechaEmision: `2026-${m}-10`, monto: 2300 })),
      cobro({ id: "ib-150", cuentaId: "ibero", periodo: "2026-06", fechaProgramada: "2026-06-01", fechaEmision: "2026-06-01", monto: 150 }),
      cobro({ id: "ib-may", cuentaId: "ibero", periodo: "2026-05", fechaProgramada: "2026-05-15", fechaEmision: "2026-05-10", monto: 3550 }),
      cobro({ id: "ib-jun", cuentaId: "ibero", periodo: "2026-06", fechaProgramada: "2026-06-15", fechaEmision: "2026-06-10", monto: 3550 }),
      cobro({ id: "mts-03", cuentaId: "mts", periodo: "2026-03", fechaProgramada: "2026-03-15", fechaEmision: "2026-03-15", monto: 420, estado: "COBRADO" }),
      cobro({ id: "iva-08", cuentaId: "iva", periodo: "2026-08", fechaProgramada: "2026-08-10", fechaEmision: "2026-08-10", monto: 2655.5 }),
      cobro({ id: "num-05", cuentaId: "num", periodo: "2026-05", fechaProgramada: "2026-05-15", fechaEmision: "2026-05-15", monto: 800, estado: "COBRADO", numeroFactura: "FAC/2026/0999" }),
    ],
    facturas: [
      ...estado.facturas,
      sinPagar({ id: "f329", odooMoveId: 329, numero: "FAC/2026/0329", cuentaId: "almotec", odooPartnerId: 40, invoiceDate: "2026-08-12", montoNeto: 6900 }),
      sinPagar({ id: "f328", odooMoveId: 328, numero: "FAC/2026/0328", cuentaId: "ibero", odooPartnerId: 41, invoiceDate: "2026-07-10", montoNeto: 7100 }),
      sinPagar({ id: "f280", odooMoveId: 280, numero: "FAC/2026/0280", cuentaId: "mts", odooPartnerId: 42, invoiceDate: "2026-03-20", montoNeto: 440 }),
      sinPagar({ id: "f346", odooMoveId: 346, numero: "FAC/2026/0346", cuentaId: "iva", odooPartnerId: 43, invoiceDate: "2026-08-10", montoNeto: 2350 }),
      sinPagar({ id: "f400", odooMoveId: 400, numero: "FAC/2026/0400", cuentaId: "lib", odooPartnerId: 44, invoiceDate: "2026-07-01", montoNeto: 1000 }),
    ],
    liberaciones: [liberada({ id: "l400", cuentaId: "lib", referenciaExterna: "FAC/2026/0400", monto: 1000 })],
  };

  it("⭐ cobertura: toda factura por cobrar y todo cobro facturado terminan juntados o en una sola línea", () => {
    expect(detectarDiferenciasOdoo(todo).map((l) => l.codigo)).toEqual(
      expect.arrayContaining(["ODOO-FACTURA-VARIAS-CUOTAS", "ODOO-MONTO", "ODOO-NUMERO-SIN-DOCUMENTO", "ODOO-LIBERADAS-PENDIENTES", "ODOO-COBRO-FACTURADO-EN-MERCURY"]),
    );
    expect(coberturaDelCruce(todo)).toEqual({ facturasSinCasa: [], facturasRepetidas: [], cobrosSinCasa: [], cobrosRepetidos: [] });
  });

  /* ── ⭐ 2026-09-25 · CADA FILA CON NOMBRE PROPIO ─────────────────────────────────────
     Para marcar «está bien así» fila por fila, cada fila de cada línea necesita una clave estable —la factura, la nota, el
     cobro, la cuenta, la factura soltada— y una huella de sus NÚMEROS. Medido ese día en producción: de 16 líneas, solo las
     de facturas soltadas tenían id; en las otras la fila era texto, y la única huella era la del grupo entero, con los
     nombres adentro. */
  const LAS_VEINTE_LINEAS = [
    "ODOO-SIN-CUENTA",
    "ODOO-MONEDA",
    "ODOO-MONEDA-CORREGIDA",
    "ODOO-NOTA-SIN-APLICAR",
    "ODOO-MONTO",
    "ODOO-POR-COBRAR-PAGADA",
    "ODOO-COBRADO-SIN-PAGAR",
    "ODOO-FACTURA-VARIAS-CUOTAS",
    "ODOO-COBRO-SIN-FACTURA",
    "ODOO-COBRO-FACTURADO-EN-MERCURY",
    "ODOO-NUMERO-SIN-DOCUMENTO",
    "ODOO-NUMERO-DE-OTRO-CLIENTE",
    "ODOO-FACTURA-SIN-COBRO",
    "ODOO-LIBERADAS-PENDIENTES",
    "ODOO-LIBERADAS-SIN-NUMERO",
    "LIBERADAS-FUERA-DE-ODOO",
    "ODOO-IN-PAYMENT",
    "ODOO-EXENTAS",
    "CUENTA-INTERNACIONAL-EN-ODOO",
    "VENTA-CONTADA-DOS-VECES",
  ];
  /* Lo que le falta a `todo` para que salgan las veinte. */
  const deOtraLinea = (id: string, nombre: string, tipo = "NACIONAL", viaCobro = "ODOO") => ({ id, nombre, tipo, viaCobro });
  const todas = {
    ...todo,
    cuentas: [
      ...todo.cuentas,
      deOtraLinea("gem", "GEMELA"),
      deOtraLinea("otro", "OTRO"),
      deOtraLinea("sinv", "SIN VINCULO"),
      deOtraLinea("intl", "INTERNACIONAL", "INTERNACIONAL"),
      deOtraLinea("rs", "Real Shipping & Trade", "INTERNACIONAL", "MERCURY"),
    ],
    /* «sinv» e «intl» sin cliente de Odoo: sus cobros facturados no se pueden verificar. */
    cuentasVinculadas: new Set([...todo.cuentasVinculadas, "gem", "otro"]),
    cobros: [
      ...todo.cobros,
      cobro({ id: "sinv-07", cuentaId: "sinv", cuentaNombre: "SIN VINCULO", periodo: "2026-07", fechaProgramada: "2026-07-15", fechaEmision: "2026-07-15", monto: 900 }),
      cobro({ id: "intl-07", cuentaId: "intl", cuentaNombre: "INTERNACIONAL", periodo: "2026-07", fechaProgramada: "2026-07-15", fechaEmision: "2026-07-15", monto: 700 }),
      /* El número de una factura que Odoo le emitió a «gem». */
      cobro({ id: "otro-06", cuentaId: "otro", cuentaNombre: "OTRO", periodo: "2026-06", fechaProgramada: "2026-06-15", fechaEmision: "2026-06-15", monto: 1234, estado: "COBRADO", numeroFactura: "FAC/2026/0500" }),
      /* Real Shipping INV-9 contra sus cuotas 1 y 2 (2026-09-14). */
      cobro({ id: "inv9", cuentaId: "rs", cuentaNombre: "Real Shipping & Trade", servicioId: "libro-rs", servicio: "Libro", periodo: "2026-01", fechaProgramada: "2026-01-15", fechaEmision: "2026-01-15", monto: 6000, estado: "COBRADO", numeroFactura: "INV-9" }),
      ...[1, 2].map((n) =>
        cobro({ id: `rs-${n}`, cuentaId: "rs", cuentaNombre: "Real Shipping & Trade", servicioId: "impl", servicio: "Real Shipping", periodo: "2026-07", fechaProgramada: "2026-07-15", fechaEmision: "2026-01-16", monto: 1500, estado: "COBRADO" }),
      ),
    ],
    facturas: [
      ...todo.facturas,
      /* Sin cuenta: dos en dólares y una en colones del mismo cliente de Odoo. */
      sinPagar({ id: "sc1", odooMoveId: 501, numero: "FAC/2026/0501", cuentaId: null, odooPartnerId: 90, odooPartnerNombre: "SIN CUENTA S.A.", montoNeto: 1000 }),
      sinPagar({ id: "sc2", odooMoveId: 502, numero: "FAC/2026/0502", cuentaId: null, odooPartnerId: 90, odooPartnerNombre: "SIN CUENTA S.A.", montoNeto: 2000 }),
      sinPagar({ id: "sc3", odooMoveId: 503, numero: "FAC/2026/0503", cuentaId: null, odooPartnerId: 90, odooPartnerNombre: "SIN CUENTA S.A.", moneda: "CRC", montoNeto: 50000 }),
      /* El mismo importe en dos monedas. */
      factura({ id: "gm1", odooMoveId: 510, numero: "FAC/2026/0510", cuentaId: "gem", odooPartnerId: 91, odooPartnerNombre: "GEMELA S.A.", montoNeto: 777 }),
      factura({ id: "gm2", odooMoveId: 511, numero: "FAC/2026/0511", cuentaId: "gem", odooPartnerId: 91, odooPartnerNombre: "GEMELA S.A.", moneda: "CRC", montoNeto: 777 }),
      factura({ id: "fo", odooMoveId: 500, numero: "FAC/2026/0500", cuentaId: "gem", odooPartnerId: 91, odooPartnerNombre: "GEMELA S.A.", invoiceDate: "2026-06-15", montoNeto: 5555 }),
      /* La moneda equivocada ya corregida: revertida y su nota en dólares, la buena en colones. */
      factura({ id: "pc1", odooMoveId: 520, numero: "FAC/2026/0520", cuentaId: null, odooPartnerId: 92, odooPartnerNombre: "CORREGIDA S.A.", montoNeto: 3000, paymentState: "reversed" }),
      factura({ id: "pc2", odooMoveId: 521, numero: "NC/2026/0521", cuentaId: null, odooPartnerId: 92, odooPartnerNombre: "CORREGIDA S.A.", montoNeto: 3000, moveType: "out_refund" }),
      factura({ id: "pc3", odooMoveId: 522, numero: "FAC/2026/0522", cuentaId: null, odooPartnerId: 92, odooPartnerNombre: "CORREGIDA S.A.", moneda: "CRC", montoNeto: 3000 }),
      /* Un pago sin conciliar de un año viejo, y una exenta sin cuenta. */
      factura({ id: "ip21", odooMoveId: 530, numero: "FAC/2021/0530", cuentaId: null, odooPartnerId: 93, odooPartnerNombre: "VIEJA S.A.", invoiceDate: "2021-05-01", montoNeto: 800, paymentState: "in_payment" }),
      factura({ id: "ex1", odooMoveId: 540, numero: "FAC/2026/0540", cuentaId: null, odooPartnerId: 94, odooPartnerNombre: "EXENTA S.A.", invoiceDate: "2026-03-01", montoNeto: 400, montoTotal: 400, montoImpuesto: 0 }),
    ],
    liberaciones: [
      ...todo.liberaciones,
      liberada({ id: "l-sn", cuentaId: "lib", referenciaExterna: null }),
      liberada({ id: "l-mer", cuentaId: "rs", clienteNombre: "Real Shipping & Trade", plataforma: "MERCURY", referenciaExterna: "INV-70", monto: 900 }),
    ],
  };
  const lasFilas = (ls: readonly DiferenciaOdoo[]) =>
    ls.flatMap((l) => l.items.map((i): [string, string] => [`${l.codigo} ${i.fila.clave}`, i.fila.huella])).sort(([a], [b]) => (a < b ? -1 : 1));
  const huellaDeLaFila = (ls: readonly DiferenciaOdoo[], codigo: string, clave: string) =>
    ls.find((l) => l.codigo === codigo)?.items.find((i) => i.fila.clave === clave)?.fila.huella;

  it("⭐ toda fila de las veinte líneas tiene nombre propio: una clave única en su línea, documentos y la huella de sus números", () => {
    const lista = detectarDiferenciasOdoo(todas);
    expect(lista.map((l) => l.codigo).sort(), "el estado de prueba saca las veinte líneas").toEqual([...LAS_VEINTE_LINEAS].sort());
    for (const l of lista) {
      const claves = l.items.map((i) => i.fila.clave);
      expect(new Set(claves).size, `${l.codigo}: claves repetidas ${claves.join(", ")}`).toBe(claves.length);
      for (const i of l.items) {
        const docs = i.fila.documentos.map((d) => d.clave);
        expect(docs.length, `${l.codigo} ${i.fila.clave}: sin documentos`).toBeGreaterThan(0);
        expect(new Set(docs).size, `${l.codigo} ${i.fila.clave}: documentos repetidos`).toBe(docs.length);
        for (const d of i.fila.documentos) {
          expect(d.clave, l.codigo).toMatch(/^(f|c|l|cuenta|venta):./);
          expect(d.huella.length, `${l.codigo} ${d.clave}: huella vacía`).toBeGreaterThan(0);
        }
        /* Una fila de UNA cosa lleva su propia clave como documento; una que junta facturas, la del grupo. */
        if (!/^(cliente|anio):/.test(i.fila.clave)) expect(docs, `${l.codigo} ${i.fila.clave}`).toEqual([i.fila.clave]);
        expect(i.fila.huella).toBe(i.fila.documentos.map((d) => `${d.clave}=${d.huella}`).join(" ; "));
      }
    }
  });

  it("⭐ una fila que junta varias facturas lleva cada una como documento, con su propia huella", () => {
    const lista = detectarDiferenciasOdoo(todas);
    const docs = (codigo: string, clave: string) =>
      lista.find((l) => l.codigo === codigo)?.items.find((i) => i.fila.clave === clave)?.fila.documentos.map((d) => d.clave);
    expect(docs("ODOO-SIN-CUENTA", "cliente:90|USD")).toEqual(["f:sc1", "f:sc2"]);
    expect(docs("ODOO-SIN-CUENTA", "cliente:90|CRC")).toEqual(["f:sc3"]);
    expect(docs("ODOO-MONEDA", "cliente:91|77700")).toEqual(["f:gm1", "f:gm2"]);
    expect(docs("ODOO-MONEDA-CORREGIDA", "cliente:92|300000|USD")).toEqual(["f:pc1", "f:pc2", "f:pc3"]);
    expect(docs("ODOO-IN-PAYMENT", "anio:2021")).toEqual(["f:ip21"]);
    expect(docs("ODOO-EXENTAS", "cliente:94|USD")).toEqual(["f:ex1"]);
    /* La cuenta sin emparejar y la internacional: la fila es la cuenta. */
    expect(docs("ODOO-SIN-CUENTA", "cuenta:sinv")).toEqual(["cuenta:sinv"]);
    expect(docs("CUENTA-INTERNACIONAL-EN-ODOO", "cuenta:intl")).toEqual(["cuenta:intl"]);
  });

  it("⭐ la huella NO cambia si cambia un nombre: ni el del cliente de Odoo, ni el de la cuenta, ni el del servicio", () => {
    const otro = (s: string) => `${s} (renombrado)`;
    const renombrado = {
      ...todas,
      cuentas: todas.cuentas.map((c) => ({ ...c, nombre: otro(c.nombre) })),
      cobros: todas.cobros.map((c) => ({ ...c, cuentaNombre: otro(c.cuentaNombre), servicio: otro(c.servicio) })),
      facturas: todas.facturas.map((f) => ({ ...f, odooPartnerNombre: otro(f.odooPartnerNombre) })),
      liberaciones: todas.liberaciones.map((l) => ({ ...l, clienteNombre: otro(l.clienteNombre), liberadaPor: otro(l.liberadaPor) })),
      servicios: todas.servicios.map((s) => ({ ...s, descripcion: otro(s.descripcion) })),
      libro: new Map([...todas.libro].map(([k, d]): [string, DocumentoDelLibro] => [k, { ...d, fuente: otro(d.fuente) }])),
    };
    const antes = detectarDiferenciasOdoo(todas);
    const despues = detectarDiferenciasOdoo(renombrado);
    /* Lo que se lee sí cambia —los nombres están en pantalla—, y la huella del grupo de hoy también: por eso no alcanza. */
    expect(despues.flatMap((l) => l.items.map((i) => i.texto))).not.toEqual(antes.flatMap((l) => l.items.map((i) => i.texto)));
    const sinCuenta = (ls: readonly DiferenciaOdoo[]) => ls.find((l) => l.codigo === "ODOO-SIN-CUENTA");
    expect(huellaDe(sinCuenta(despues) ?? { items: [] })).not.toBe(huellaDe(sinCuenta(antes) ?? { items: [] }));
    expect(lasFilas(despues)).toEqual(lasFilas(antes));
  });

  it("⭐ la huella SÍ cambia si cambia un número, y la fila sigue siendo la misma", () => {
    type Estado = typeof todas;
    const conFactura = (e: Estado, id: string, p: Partial<FacturaParaCruzar>): Estado => ({ ...e, facturas: e.facturas.map((f) => (f.id === id ? { ...f, ...p } : f)) });
    const conCobro = (e: Estado, id: string, p: Partial<CobroParaCruzar>): Estado => ({ ...e, cobros: e.cobros.map((c) => (c.id === id ? { ...c, ...p } : c)) });
    const conLiberacion = (e: Estado, id: string, p: Partial<LiberacionParaCruzar>): Estado => ({
      ...e,
      liberaciones: e.liberaciones.map((l) => (l.id === id ? { ...l, ...p } : l)),
    });
    const casos: Array<[string, string, string, (e: Estado) => Estado]> = [
      ["lo que falta pagar de una factura sin cuenta", "ODOO-SIN-CUENTA", "cliente:90|USD", (e) => conFactura(e, "sc2", { paymentState: "partial", montoResidual: 1000 })],
      [
        "un cobro nuevo sin verificar de una cuenta sin emparejar",
        "ODOO-SIN-CUENTA",
        "cuenta:sinv",
        (e) => ({ ...e, cobros: [...e.cobros, cobro({ id: "sinv-08", cuentaId: "sinv", cuentaNombre: "SIN VINCULO", periodo: "2026-08", fechaProgramada: "2026-08-15", fechaEmision: "2026-08-15", monto: 900 })] }),
      ],
      ["el estado de pago de una de las dos monedas", "ODOO-MONEDA", "cliente:91|77700", (e) => conFactura(e, "gm2", { paymentState: "not_paid", montoResidual: 877.01 })],
      ["el estado de pago de la buena, en la moneda corregida", "ODOO-MONEDA-CORREGIDA", "cliente:92|300000|USD", (e) => conFactura(e, "pc3", { paymentState: "in_payment" })],
      ["el saldo de una nota de crédito", "ODOO-NOTA-SIN-APLICAR", "f:n242", (e) => conFactura(e, "n242", { paymentState: "partial", montoResidual: 500 })],
      ["el monto de la cuota de un monto distinto", "ODOO-MONTO", "f:f280", (e) => conCobro(e, "mts-03", { monto: 410 })],
      ["el estado del cobro de un par por cobrar con la factura pagada", "ODOO-POR-COBRAR-PAGADA", "f:f323", (e) => conCobro(e, "gs-ago", { estado: "PROGRAMADO" })],
      ["lo que falta pagar de la factura de un cobro cobrado", "ODOO-COBRADO-SIN-PAGAR", "f:f218", (e) => conFactura(e, "f218", { paymentState: "partial", montoResidual: 1000 })],
      ["el estado de pago de una factura de varias cuotas", "ODOO-FACTURA-VARIAS-CUOTAS", "f:f329", (e) => conFactura(e, "f329", { paymentState: "partial", montoResidual: 3000 })],
      ["el monto de un cobro sin factura", "ODOO-COBRO-SIN-FACTURA", "c:palomas-03", (e) => conCobro(e, "palomas-03", { monto: 560 })],
      [
        "el documento que el Excel da por Mercury",
        "ODOO-COBRO-FACTURADO-EN-MERCURY",
        "c:acccsa-01",
        (e) => ({ ...e, libro: new Map([...e.libro].map(([k, d]): [string, DocumentoDelLibro] => [k, k === "acccsa-01" ? { ...d, total: 700 } : d])) }),
      ],
      ["el número anotado que Odoo no tiene", "ODOO-NUMERO-SIN-DOCUMENTO", "c:num-05", (e) => conCobro(e, "num-05", { numeroFactura: "FAC/2026/0998" })],
      ["el monto del cobro con el número de otro cliente", "ODOO-NUMERO-DE-OTRO-CLIENTE", "c:otro-06", (e) => conCobro(e, "otro-06", { monto: 1300 })],
      ["lo que falta pagar de una factura sin cobro", "ODOO-FACTURA-SIN-COBRO", "f:f298", (e) => conFactura(e, "f298", { paymentState: "partial", montoResidual: 2000 })],
      ["el monto de una factura soltada", "ODOO-LIBERADAS-PENDIENTES", "l:l400", (e) => conLiberacion(e, "l400", { monto: 900 })],
      ["el monto de una factura soltada sin número", "ODOO-LIBERADAS-SIN-NUMERO", "l:l-sn", (e) => conLiberacion(e, "l-sn", { monto: 2000 })],
      ["lo que se pidió hacer con una soltada fuera de Odoo", "LIBERADAS-FUERA-DE-ODOO", "l:l-mer", (e) => conLiberacion(e, "l-mer", { decision: "REVERTIR" })],
      ["el neto de un pago sin conciliar de un año viejo", "ODOO-IN-PAYMENT", "anio:2021", (e) => conFactura(e, "ip21", { montoNeto: 850 })],
      ["el neto de una exenta", "ODOO-EXENTAS", "cliente:94|USD", (e) => conFactura(e, "ex1", { montoNeto: 450, montoTotal: 450 })],
      [
        "cuántos documentos tiene en Odoo una cuenta internacional",
        "CUENTA-INTERNACIONAL-EN-ODOO",
        "cuenta:intl",
        (e) => ({ ...e, facturas: [...e.facturas, factura({ id: "fi", odooMoveId: 599, numero: "FAC/2020/0599", cuentaId: "intl", invoiceDate: "2020-01-10" })] }),
      ],
      ["el monto de una cuota en duda", "VENTA-CONTADA-DOS-VECES", "venta:rs|USD|INV-9", (e) => conCobro(e, "rs-1", { monto: 1400 })],
    ];
    expect(new Set(casos.map(([, codigo]) => codigo)), "un caso por cada línea").toEqual(new Set(LAS_VEINTE_LINEAS));
    const antes = detectarDiferenciasOdoo(todas);
    for (const [que, codigo, clave, cambiar] of casos) {
      const h0 = huellaDeLaFila(antes, codigo, clave);
      const h1 = huellaDeLaFila(detectarDiferenciasOdoo(cambiar(todas)), codigo, clave);
      expect(h0, `${que}: la fila ${clave} no está en ${codigo}`).toBeDefined();
      expect(h1, `${que}: la fila ${clave} dejó de estar en ${codigo}`).toBeDefined();
      expect(h1, `${que}: la huella de ${clave} no cambió`).not.toBe(h0);
    }
  });

  it("⚠ lo que no es un número de la fila no la reabre: anotar el número con que ya se juntaba, pagar una exenta", () => {
    const antes = detectarDiferenciasOdoo(todas);
    /* La cuota de MTS se juntaba por monto con la 0280: anotarle ese número no cambia nada de la fila. */
    const conNumero = { ...todas, cobros: todas.cobros.map((c) => (c.id === "mts-03" ? { ...c, numeroFactura: "FAC/2026/0280" } : c)) };
    expect(huellaDeLaFila(detectarDiferenciasOdoo(conNumero), "ODOO-MONTO", "f:f280")).toBe(huellaDeLaFila(antes, "ODOO-MONTO", "f:f280"));
    /* «Exentas» habla del impuesto que falta: que se pague no cambia eso. */
    const pagada = { ...todas, facturas: todas.facturas.map((f) => (f.id === "ex1" ? { ...f, paymentState: "in_payment" } : f)) };
    expect(huellaDeLaFila(detectarDiferenciasOdoo(pagada), "ODOO-EXENTAS", "cliente:94|USD")).toBe(huellaDeLaFila(antes, "ODOO-EXENTAS", "cliente:94|USD"));
  });

  it("⛔ «facturas sin cobro» ya no corta en 60 filas: la 61 también se ve y se puede marcar", () => {
    const muchas = Array.from({ length: 65 }, (_, i) =>
      sinPagar({ id: `m${i}`, odooMoveId: 2000 + i, numero: `FAC/2026/${String(2000 + i)}`, cuentaId: "gem", odooPartnerId: 91, invoiceDate: "2026-06-01", montoNeto: 100 + i }),
    );
    const l = detectarDiferenciasOdoo({ ...todas, facturas: [...todas.facturas, ...muchas] }).find((x) => x.codigo === "ODOO-FACTURA-SIN-COBRO");
    const nuestras = l?.items.filter((i) => i.fila.clave.startsWith("f:m")) ?? [];
    expect(nuestras).toHaveLength(65);
    expect(l?.titulo).toBe(`${l?.items.length} facturas de Odoo sin un cobro que las explique`);
  });
});

/**
 * ── ⭐ 2026-09-14 · LA MISMA VENTA CONTADA DOS VECES ─────────────────────────────
 * Real Shipping INV-9 (US$6.000) entró cobrada desde el Excel y la cuenta ya tenía sus cuotas 1 y 2 (US$1.500 cada una,
 * facturadas al día siguiente). Alliance RH INV-46 (US$120) entró cobrada y «Capacitación Sales» no generó sus cobros.
 * La regla vive en lib/cobranza/venta-duplicada.ts; acá, que la página la muestre sin contar nada dos veces.
 */
describe("⭐ «Lo que no cuadra» muestra la misma venta contada dos veces", () => {
  const cuentas = [
    { id: "rs", nombre: "Real Shipping & Trade", tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
    { id: "al", nombre: "Alliance RH", tipo: "INTERNACIONAL", viaCobro: "MERCURY" },
  ];
  const libroUSD = "Facturación importada del libro de Alex (USD)";
  const cobros = [
    cobro({ id: "inv9", cuentaId: "rs", cuentaNombre: "Real Shipping & Trade", servicioId: "libro-rs", servicio: libroUSD, periodo: "2026-01", fechaProgramada: "2026-01-15", fechaEmision: "2026-01-15", monto: 6000, estado: "COBRADO", numeroFactura: "INV-9" }),
    ...[1, 2].map((n) =>
      cobro({ id: `rs-${n}`, cuentaId: "rs", cuentaNombre: "Real Shipping & Trade", servicioId: "impl", servicio: "Real Shipping", periodo: "2026-07", fechaProgramada: "2026-07-15", fechaEmision: "2026-01-16", monto: 1500, estado: "COBRADO" }),
    ),
    cobro({ id: "inv46", cuentaId: "al", cuentaNombre: "Alliance RH", servicioId: "libro-al", servicio: libroUSD, periodo: "2026-08", fechaProgramada: "2026-08-07", fechaEmision: "2026-08-07", monto: 120, estado: "COBRADO", numeroFactura: "INV-46" }),
  ];
  const servicios: ServicioParaCruzar[] = [
    { id: "cap", cuentaId: "al", descripcion: "Capacitación Sales", moneda: "USD", montoTotal: 240, fechaInicio: "2026-08-15", activo: true, cobros: 0 },
  ];
  const estado = {
    ...alDia,
    cuentasVinculadas: new Set<string>(),
    cuentasSinVinculo: 0,
    cuentasTotales: 0,
    liberaciones: [],
    cuentas,
    aceptadas: new Map<string, string>(),
    facturas: [],
    cobros,
    servicios,
  };

  it("Real Shipping y Alliance RH salen en una línea, con la plata en duda y sin ser la casa de nadie", () => {
    const l = detectarDiferenciasOdoo(estado).find((i) => i.codigo === "VENTA-CONTADA-DOS-VECES");
    expect(l?.titulo).toBe("2 ventas pueden estar contadas dos veces en su cuenta");
    expect(l?.donde).toBe("PREGUNTANDO");
    /* La factura no está en Odoo: la nombra su número, anotado en los cobros de su cuenta. */
    expect(l?.items.map((i) => i.fila.clave)).toEqual(["venta:rs|USD|INV-9", "venta:al|USD|INV-46"]);
    expect(comoSeLeen(l?.items)).toEqual([
      {
        texto: "Real Shipping & Trade — INV-9 por US$6.000",
        monto: 3000,
        moneda: "USD",
        nota: "2026-01-15 · cobrado · puede ser la misma venta que US$1.500 facturada el 2026-01-16 (cobrada) + US$1.500 facturada el 2026-01-16 (cobrada), de «Real Shipping»",
      },
      {
        texto: "Alliance RH — INV-46 por US$120",
        monto: 120,
        moneda: "USD",
        nota: "2026-08-07 · cobrado · puede ser la misma venta que el servicio «Capacitación Sales» (US$240, arranca el 2026-08-15, todavía sin cobros)",
      },
    ]);
    expect(l?.plata.map((p) => p.clave)).toEqual(["c:rs-1", "c:rs-2", "s:cap"]);
    expect(l?.documentos).toEqual([]);
    expect(resumenDeDiferencias(detectarDiferenciasOdoo(estado)).plata).toEqual([{ moneda: "USD", monto: 3120 }]);
  });

  it("⛔ con el número de la factura anotado en las cuotas, ya no es una venta doble", () => {
    const anotadas = cobros.map((c) => (c.id.startsWith("rs-") ? { ...c, numeroFactura: "INV-9" } : c));
    const l = detectarDiferenciasOdoo({ ...estado, cobros: anotadas, servicios: [] });
    expect(l.map((i) => i.codigo)).not.toContain("VENTA-CONTADA-DOS-VECES");
  });
});
