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
  cruzar,
  detectarDiferenciasOdoo,
  huellaDe,
  montosEnDosMonedas,
  type CobroParaCruzar,
  type FacturaParaCruzar,
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
  facturado: true,
  ...p,
});

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
  const base = { cuentasSinVinculo: 49, cuentasTotales: 49, aceptadas: new Map<string, string>() };

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
      cobros: [cobro({ facturado: true })],
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
    /* Y el balde AVISA de que su propio total está inflado por esas mismas facturas. */
    expect(lista.find((i) => i.codigo === "ODOO-SIN-CUENTA")?.detalle).toMatch(/INFLADO/);
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
