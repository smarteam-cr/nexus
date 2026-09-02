/**
 * lib/cobranza/odoo/espejo.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/odoo --project unit`.
 *
 * ── EL DEFECTO QUE ESTAS GUARDAS EXISTEN PARA QUE NO VUELVA ─────────────────────
 * El molde de este sync (`lib/ventas/sync-ganadas.ts`) **no tiene un solo test**, y su guarda
 * del 50 % —la que impide que un timeout de HubSpot vacíe el año de ventas— nunca se ejercitó
 * contra un caso. Este archivo existe para que el espejo de Odoo no herede eso.
 *
 * Los números son los medidos el 2026-09-02 contra `erp.smarteamcr.com`: 304 facturas de
 * cliente, de las cuales **176 en `in_payment`**, 59 `paid`, 50 `not_paid`, 16 `reversed` y
 * 3 `partial`.
 */
import { describe, it, expect } from "vitest";
import {
  calcularDeltas,
  esBorradoMasivo,
  esCorridaParcial,
  fechaOdoo,
  many2one,
  mapearFactura,
  numeroOdoo,
  proponerSemaforo,
  senalDe,
  textoOdoo,
  vencimientoDe,
  type FacturaPrevia,
} from "./espejo";

/** Una fila de `account.move` con la forma exacta en que Odoo la devuelve. */
const CRUDA = {
  id: 1234,
  name: "FV/2026/0087",
  move_type: "out_invoice",
  state: "posted",
  payment_state: "in_payment",
  invoice_date: "2026-07-15",
  invoice_date_due: "2026-07-30",
  amount_untaxed: 2000,
  amount_total: 2260,
  amount_residual: 0,
  amount_tax: 260,
  amount_total_signed: 2260,
  currency_id: [2, "USD"],
  partner_id: [35, "ACCCSA REVISTA & PUBLICACIONES S.A."],
  write_date: "2026-07-16 14:22:03",
};

describe("lo que Odoo manda cuando un campo está vacío", () => {
  it("⚠ trata el booleano `false` como vacío, no como el texto «false»", () => {
    /* Odoo devuelve `false` —no null, no ""— para fechas, textos y relaciones vacías. Un
       `?? ""` lo deja pasar y termina escribiendo el string "false" en la base. */
    expect(textoOdoo(false)).toBeNull();
    expect(fechaOdoo(false)).toBeNull();
    expect(many2one(false)).toBeNull();
    expect(textoOdoo("   ")).toBeNull();
  });

  it("lee el many2one como la tupla [id, etiqueta] que es", () => {
    expect(many2one([35, "ACCCSA REVISTA & PUBLICACIONES S.A."])).toEqual({
      id: 35,
      nombre: "ACCCSA REVISTA & PUBLICACIONES S.A.",
    });
  });

  it("recorta la hora de un datetime de Odoo y deja la fecha", () => {
    expect(fechaOdoo("2026-07-16 14:22:03")).toBe("2026-07-16");
  });

  it("nunca devuelve NaN por un monto raro", () => {
    expect(numeroOdoo(false)).toBe(0);
    expect(numeroOdoo("no es un número")).toBe(0);
    expect(numeroOdoo("2000.5")).toBe(2000.5);
  });
});

describe("espejar una factura", () => {
  it("guarda el neto Y el total, porque los cobros de Nexus están sin IVA", () => {
    const r = mapearFactura(CRUDA);
    expect("factura" in r).toBe(true);
    if (!("factura" in r)) return;
    /* Comparar `Cobro.monto` contra el total marcaría las 304 facturas como descuadradas por
       exactamente 13 %. El que se compara es el neto. */
    expect(r.factura.montoNeto).toBe(2000);
    expect(r.factura.montoTotal).toBe(2260);
    expect(r.factura.moneda).toBe("USD");
    expect(r.factura.odooPartnerId).toBe(35);
  });

  it("⚠ rechaza en vez de inventar cuando falta la fecha, el partner o la moneda", () => {
    /* Una factura sin `invoice_date` no cae en ningún mes: espejarla con un default la
       escondería dentro de un total correcto. Que aparezca en la lista de inconsistencias es
       mejor que un espejo completo con filas mentirosas. */
    expect(mapearFactura({ ...CRUDA, invoice_date: false })).toHaveProperty("rechazo");
    expect(mapearFactura({ ...CRUDA, partner_id: false })).toHaveProperty("rechazo");
    expect(mapearFactura({ ...CRUDA, currency_id: false })).toHaveProperty("rechazo");
  });

  it("guarda el total CON SIGNO aparte, porque el de la nota de crédito viene positivo", () => {
    /* `amount_total` es positivo también en las notas de crédito: sumar facturas y notas con
       él sobreestima la venta y nada avisa. */
    const nc = mapearFactura({ ...CRUDA, move_type: "out_refund", amount_total: 500, amount_total_signed: -500 });
    if (!("factura" in nc)) throw new Error("debería espejar");
    expect(nc.factura.montoTotal).toBe(500);
    expect(nc.factura.montoTotalSigned).toBe(-500);
  });
});

describe("el vencimiento", () => {
  it("se calcula con invoice_date + creditoDias, NUNCA con invoice_date_due", () => {
    /* El `invoice_date_due` de cabecera es el MÁXIMO de los vencimientos de las líneas, no el
       término del cliente. Acá la factura trae due=2026-07-30 y el resultado la ignora. */
    expect(vencimientoDe("2026-07-15", 30)).toBe("2026-08-14");
  });

  it("⚠ con creditoDias en null cae a 15 días — hoy son 48 de las 49 cuentas", () => {
    expect(vencimientoDe("2026-07-15", null)).toBe("2026-07-30");
    expect(vencimientoDe("2026-07-15", undefined)).toBe("2026-07-30");
  });

  it("cruza el fin de mes y el de año sin corrimientos", () => {
    expect(vencimientoDe("2026-12-20", 15)).toBe("2027-01-04");
    expect(vencimientoDe("2026-02-20", 15)).toBe("2026-03-07");
  });
});

describe("el semáforo: Odoo promueve, nunca degrada, y nunca decide", () => {
  const ON = { promocionHabilitada: true };
  const OFF = { promocionHabilitada: false };

  it("traduce los 6 payment_state y no manda ninguno a «impaga» por descarte", () => {
    expect(senalDe("paid")).toBe("PAGADA");
    expect(senalDe("in_payment")).toBe("PAGADA_SIN_CONCILIAR");
    expect(senalDe("partial")).toBe("PARCIAL");
    expect(senalDe("not_paid")).toBe("IMPAGA");
    expect(senalDe("reversed")).toBe("ANULADA_POR_NOTA_DE_CREDITO");
    expect(senalDe("invoicing_legacy")).toBe("DESCONOCIDA");
    expect(senalDe("un_estado_de_un_modulo_de_terceros")).toBe("DESCONOCIDA");
  });

  it("⛔ con la promoción apagada no propone verde ni con la factura pagada", () => {
    /* 176 de 304 facturas están en `in_payment`, y el fuente de Odoo 17 Community nunca
       asigna ese estado. Encender esto sin saber qué significa pondría 176 cobros en verde
       de golpe, y el verde en Nexus es plata que entró. */
    expect(proponerSemaforo("POR_COBRAR", "paid", OFF).estadoPropuesto).toBeNull();
    expect(proponerSemaforo("POR_COBRAR", "in_payment", OFF).estadoPropuesto).toBeNull();
  });

  it("con la promoción encendida PROPONE cobrado, y siempre pide confirmación humana", () => {
    /* INV25: ningún cobro se marca COBRADO por el sync. `COBRADO` exige `confirmadoPor` de
       una persona (INV3), así que esto es una sugerencia para la pantalla, no una orden. */
    const p = proponerSemaforo("POR_COBRAR", "paid", ON);
    expect(p.estadoPropuesto).toBe("COBRADO");
    expect(p.requiereConfirmacion).toBe(true);
  });

  it("marca «sin conciliar» solo cuando el pago está registrado pero no cruzado", () => {
    expect(proponerSemaforo("POR_COBRAR", "in_payment", ON).sinConciliar).toBe(true);
    expect(proponerSemaforo("POR_COBRAR", "paid", ON).sinConciliar).toBe(false);
  });

  it("⛔ NUNCA degrada: Nexus cobrado contra Odoo impaga sale como divergencia", () => {
    /* Degradar en silencio haría que un error de conciliación en el ERP borre plata del
       dashboard de gerencia. La contradicción se muestra; el cobro no se toca. */
    const p = proponerSemaforo("COBRADO", "not_paid", ON);
    expect(p.estadoPropuesto).toBeNull();
    expect(p.divergencia).toBe("NEXUS_COBRADO_ODOO_IMPAGA");
  });

  it("⛔ tampoco degrada con un pago parcial", () => {
    const p = proponerSemaforo("COBRADO", "partial", ON);
    expect(p.estadoPropuesto).toBeNull();
    expect(p.divergencia).toBe("NEXUS_COBRADO_ODOO_PARCIAL");
  });

  it("no propone nada sobre un cobro que ya está en verde", () => {
    expect(proponerSemaforo("COBRADO", "paid", ON).estadoPropuesto).toBeNull();
  });

  it("la nota de crédito NO es un pago", () => {
    /* 16 facturas están en `reversed`. La factura quedó saldada, pero la plata no entró:
       tratarlo como cobrado inflaría el ingreso del año. */
    const p = proponerSemaforo("POR_COBRAR", "reversed", ON);
    expect(p.estadoPropuesto).toBeNull();
    expect(p.nota).toMatch(/no.*pago|plata no entró/i);
  });

  it("un estado desconocido no toca el cobro", () => {
    const p = proponerSemaforo("POR_COBRAR", "un_modulo_raro", ON);
    expect(p.estadoPropuesto).toBeNull();
    expect(p.divergencia).toBeNull();
  });
});

describe("la bitácora de cambios", () => {
  const PREVIA: FacturaPrevia = {
    montoTotal: 2260,
    montoResidual: 0,
    paymentState: "in_payment",
    state: "posted",
    invoiceDate: "2026-07-15",
    cuentaId: "cta_1",
  };
  const NUEVA = (() => {
    const r = mapearFactura(CRUDA);
    if (!("factura" in r)) throw new Error("la fixture debería espejar");
    return r.factura;
  })();

  it("no registra nada cuando no se movió nada", () => {
    expect(calcularDeltas(PREVIA, NUEVA, "cta_1")).toEqual([]);
  });

  it("⚠ ignora el ruido de coma flotante de Odoo", () => {
    /* Odoo hace la aritmética en float y devuelve 2260.0000000000002 cada tanto. Sin el
       redondeo a dos decimales la bitácora registraría un cambio de monto POR CORRIDA en
       facturas que nadie tocó, y a la semana nadie la lee. */
    expect(calcularDeltas({ ...PREVIA, montoTotal: 2260.0000000000002 }, NUEVA, "cta_1")).toEqual([]);
  });

  it("registra el cambio de estado de pago, que es el que mueve el semáforo", () => {
    const d = calcularDeltas({ ...PREVIA, paymentState: "not_paid" }, NUEVA, "cta_1");
    expect(d).toEqual([{ tipo: "ESTADO_PAGO", anterior: "not_paid", nuevo: "in_payment" }]);
  });

  it("registra la reatribución de cuenta con «(ninguno)» del lado vacío", () => {
    const d = calcularDeltas({ ...PREVIA, cuentaId: null }, NUEVA, "cta_1");
    expect(d).toEqual([{ tipo: "CUENTA", anterior: "(ninguno)", nuevo: "cta_1" }]);
  });
});

describe("la guarda del 50 %", () => {
  it("⛔ una corrida que trae la mitad no reclasifica nada", () => {
    /* El modo en que este sync hace daño no es fallando: es teniendo ÉXITO con la mitad de
       los datos. Si Odoo corta la conexión y el espejo concluye «las otras 200 ya no
       existen», marca 200 filas como DESAPARECIDA y el año se vacía sin un solo error. */
    expect(esCorridaParcial(150, 348)).toBe(true);
    expect(esCorridaParcial(0, 348)).toBe(true);
  });

  it("una corrida completa, o casi, sigue de largo", () => {
    expect(esCorridaParcial(348, 348)).toBe(false);
    expect(esCorridaParcial(174, 348)).toBe(false); // el umbral es estricto: 50 % NO es parcial
  });

  it("⚠⚠ y el hueco que la guarda del 50 % dejaba abierto", () => {
    /* Una corrida que trae el 60 % PASA el filtro de parcial — y después marca el 40 % restante
       como DESAPARECIDA. El umbral del 50 % protege contra la catástrofe y deja pasar el
       desastre: cientos de facturas borradas del espejo por un fallo que no fue un borrado. */
    expect(esCorridaParcial(210, 347), "el 60 % no se considera parcial").toBe(false);
    expect(esBorradoMasivo(137, 347), "…y ahí 137 facturas se irían al tacho").toBe(true);
  });

  it("un borrado real y chico sí se marca", () => {
    /* Nadie borra 20 facturas emitidas en un día. Una o dos sí — un asiento mal cargado que se
       anula. El corte es por proporción con un piso absoluto. */
    expect(esBorradoMasivo(0, 347)).toBe(false);
    expect(esBorradoMasivo(1, 347)).toBe(false);
    expect(esBorradoMasivo(5, 347)).toBe(false);
    expect(esBorradoMasivo(18, 347)).toBe(true);
  });

  it("con un espejo chico manda el piso absoluto, no la proporción", () => {
    /* Con 10 facturas conocidas, el 5 % es media factura: sin el piso, borrar una sola
       dispararía la alarma y el espejo no podría corregirse nunca. */
    expect(esBorradoMasivo(3, 10)).toBe(false);
    expect(esBorradoMasivo(6, 10)).toBe(true);
  });

  it("⚠ la PRIMERA corrida nunca es parcial", () => {
    /* Sin el `conocidas > 0`, con la tabla vacía toda corrida sería parcial para siempre y el
       espejo no arrancaría nunca. */
    expect(esCorridaParcial(0, 0)).toBe(false);
    expect(esCorridaParcial(348, 0)).toBe(false);
  });
});
