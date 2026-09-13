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
  cruzar,
  detectarDiferenciasOdoo,
  esDocumentoVivo,
  huellaDe,
  liberacionesPendientes,
  montosEnDosMonedas,
  numeroVerificableEnOdoo,
  type CobroParaCruzar,
  type DiferenciaOdoo,
  type FacturaParaCruzar,
  type LiberacionParaCruzar,
} from "./diferencias";

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
  ...p,
});

/** Lo que el cruce necesita saber del emparejado y del espejo, en su forma más neutra. */
const alDia = { cuentasVinculadas: new Set<string>(["cta1"]), ultimaCorridaOk: "2026-09-02" };

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
        factura({ id: "a", odooMoveId: 1, cuentaId: null, montoNeto: 1000, moneda: "USD" }),
        factura({ id: "b", odooMoveId: 2, cuentaId: null, montoNeto: 500000, moneda: "CRC" }),
      ],
    });
    const sinCuenta = lista.find((i) => i.codigo === "ODOO-SIN-CUENTA");
    expect(sinCuenta?.detalle).toMatch(/USD.*\+.*CRC|CRC.*\+.*USD/);
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

  it("el estado in_payment sale como decisión de dirección, no como tarea de cobranza", () => {
    /* Encender la promoción sin saber qué significa pondría 188 cobros en verde de golpe, y
       el verde en Nexus es plata que entró. */
    const lista = detectarDiferenciasOdoo({
      ...base,
      cobros: [],
      facturas: [factura({ paymentState: "in_payment" })],
    });
    expect(lista.find((i) => i.codigo === "ODOO-IN-PAYMENT")?.resuelve).toBe("DIRECCION");
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
        factura({ id: "b", odooMoveId: 2, cuentaId: null, montoNeto: 11541250, moneda: "USD", odooPartnerId: 77 }),
        factura({ id: "c", odooMoveId: 3, cuentaId: null, montoNeto: 11541250, moneda: "CRC", odooPartnerId: 77 }),
      ],
    });
    expect(lista.find((i) => i.codigo === "ODOO-MONEDA")?.yaContadoEn).toBe("ODOO-SIN-CUENTA");
    expect(lista.find((i) => i.codigo === "ODOO-MONEDA")?.montoEnJuego).toBe(11541250);
    /* Y el balde AVISA de que su propio total está inflado por esas mismas facturas — con la
       cifra detectada, no con un «mucho menor» escrito a mano. */
    expect(lista.find((i) => i.codigo === "ODOO-SIN-CUENTA")?.detalle).toMatch(/INFLADO en USD 11.541.250,00/);
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
        factura({ id: "a", odooMoveId: 1, cuentaId: null, montoNeto: 1000 }),
        factura({ id: "n", odooMoveId: 2, cuentaId: null, montoNeto: 1000, moveType: "out_refund" }),
        factura({ id: "r", odooMoveId: 3, cuentaId: null, montoNeto: 5000, paymentState: "reversed" }),
      ],
    });
    const l = lista.find((i) => i.codigo === "ODOO-SIN-CUENTA");
    expect(l?.titulo).toMatch(/^1 facturas de Odoo/);
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
    expect(sinCuenta?.items).toEqual([{ texto: "Wherex — cuenta sin emparejar", nota: "1 cobro facturado sin verificar" }]);
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
    expect(l?.detalle).toContain("No se cuentan 1 factura(s) anteriores al primer cobro");
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
    expect(l?.detalle).toContain("No se cuentan 1 cobro(s) con un número que el espejo todavía no pudo ver");
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
    expect(lCon.items[0]?.nota).toBe("internacional · vía de cobro: Odoo (por defecto) · ⚠ tiene facturas con número de Mercury: INV-4-1");
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
