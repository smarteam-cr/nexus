/**
 * lib/cobranza/plan-vs-cobros.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/plan-vs-cobros.test.ts --project unit`.
 *
 * ── EL CASO QUE ESTE ARCHIVO PROTEGE ────────────────────────────────────────────
 * Wherex, con los números reales de producción. El cliente dejó de pagar, se fue, y se acordó
 * un pago distinto: el plan pasó a 2 cuotas por **$5.100**, pero los cobros siguieron siendo
 * los 4 originales de $2.125 = **$8.500**, con tres ya facturados y uno cobrado.
 *
 * Las tres sumas son la aserción principal, porque son lo único que le explica a una persona
 * para qué sirve soltar una factura:
 *
 *     hoy .................. 8.500
 *     si no se suelta nada .. 6.375   ← el botón «Generar cobros» solo llega hasta acá
 *     soltando lo soltable .. 5.100   ✓
 *
 * ⚠ Si el segundo número deja de ser 6.375, alguien aflojó `esIntocable` y el motor pasó a
 * poder reescribir un cobro ya facturado.
 */
import { describe, it, expect } from "vitest";
import { materializeCobros, type CobroDraft, type PlanEngineInput, type ServicioEngineInput } from "./engine";
import {
  BLOQUEO_LABEL,
  bloqueoDe,
  planDeCambios,
  sumaConDecisiones,
  type Bloqueo,
  type CobroMaterializado,
} from "./plan-vs-cobros";

/* ── El caso Wherex, tal cual está en producción ─────────────────────────────────── */

const SERVICIO_WHEREX: ServicioEngineInput = {
  id: "svc-wherex",
  montoTotal: 5100,
  moneda: "USD",
  fechaInicioFacturacion: "2026-05-15",
  duracionMeses: 2,
  diaCobroAncla: 15,
};

/** El acuerdo NUEVO: 2.125 al arrancar y el resto al mes. Suma 5.100 = el total del servicio. */
const PLAN_WHEREX: PlanEngineInput = {
  template: "PERSONALIZADO",
  numCuotas: null,
  cuotas: [
    { orden: 1, base: "MONTO_FIJO", valor: 2125, offsetMeses: 0 },
    { orden: 2, base: "MONTO_FIJO", valor: 2975, offsetMeses: 1 },
  ],
};

const cobro = (p: Partial<CobroMaterializado> & { id: string; numCuota: number | null }): CobroMaterializado => ({
  periodo: "2026-05",
  monto: 2125,
  estado: "PROGRAMADO",
  fechaEmision: null,
  origen: "IMPORTACION",
  fechaProgramadaISO: "2026-05-15",
  ...p,
});

/** Los 4 cobros que hay hoy, con su estado real. */
const COBROS_WHEREX: CobroMaterializado[] = [
  cobro({ id: "c1", numCuota: 1, periodo: "2026-05", estado: "COBRADO", fechaEmision: "2026-05-15", fechaProgramadaISO: "2026-05-15" }),
  cobro({ id: "c2", numCuota: 2, periodo: "2026-06", estado: "POR_COBRAR", fechaEmision: "2026-06-15", fechaProgramadaISO: "2026-06-15", promesaPago: "2026-08-20" }),
  cobro({ id: "c3", numCuota: 3, periodo: "2026-07", estado: "POR_COBRAR", fechaEmision: "2026-07-15", fechaProgramadaISO: "2026-07-15" }),
  cobro({ id: "c4", numCuota: 4, periodo: "2026-08", estado: "PROGRAMADO", fechaProgramadaISO: "2026-08-15" }),
];

const DRAFTS_WHEREX = materializeCobros(SERVICIO_WHEREX, PLAN_WHEREX, { todayISO: "2026-09-04" });

describe("Wherex — el caso real", () => {
  const plan = planDeCambios(DRAFTS_WHEREX, COBROS_WHEREX);
  const de = (n: number) => plan.bloqueados.find((b) => b.numCuota === n);

  it("⭐ las tres sumas: 8.500 hoy · 6.375 sin soltar nada · 5.100 soltando", () => {
    expect(COBROS_WHEREX.reduce((n, c) => n + c.monto, 0), "lo que hay hoy").toBe(8500);
    expect(plan.sumaDelPlan, "lo que vale el servicio").toBe(5100);
    /* ⚠ Éste es el número que explica el feature: apretar «Generar cobros» a secas deja el
       cronograma en 6.375, porque tres de los cuatro cobros son intocables. Sigue sin cuadrar. */
    expect(plan.sumaSiNoSeLibera, "solo regenerando").toBe(6375);
    expect(plan.sumaSiSeLibera, "soltando lo soltable").toBe(5100);
  });

  it("el cobro ya COBRADO no se toca, y además ya coincide con el plan", () => {
    /* La plata entró y el acuerdo nuevo pide exactamente eso para la cuota 1: no hay nada que
       hacer con él. Marcarlo como «hay que resolver esto» sería ruido. */
    const c1 = de(1);
    expect(c1?.motivo).toBe("cobrado");
    expect(c1?.coincide).toBe(true);
    expect(c1?.liberable).toBe(false);
    expect(c1?.montoSegunPlan).toBe(2125);
  });

  it("el facturado que el plan pide por otro monto se puede soltar", () => {
    const c2 = de(2);
    expect(c2?.motivo).toBe("facturado");
    expect(c2?.montoSegunPlan).toBe(2975);
    expect(c2?.coincide).toBe(false);
    expect(c2?.liberable).toBe(true);
    /* Tiene una promesa de pago del 20 de agosto sobre un monto que ya no existe. */
    expect(c2?.tienePromesa).toBe(true);
  });

  it("el facturado que el plan ya NI PIDE también, y se distingue del anterior", () => {
    const c3 = de(3);
    expect(c3?.motivo).toBe("facturado");
    expect(c3?.montoSegunPlan, "el plan ya no tiene una cuota 3").toBeNull();
    expect(c3?.liberable).toBe(true);
  });

  it("el único sin factura lo borra el motor solo", () => {
    expect(plan.borrar.map((b) => b.numCuota)).toEqual([4]);
    expect(plan.bloqueados.some((b) => b.numCuota === 4)).toBe(false);
  });

  it("⛔ y no propone crear ni ajustar nada mientras los cobros sigan bloqueados", () => {
    /* Las dos cuotas del plan tienen un cobro enfrente y los dos son intocables. El motor no
       puede hacer NADA por su cuenta salvo borrar el #4 — que es exactamente el problema. */
    expect(plan.crear).toEqual([]);
    expect(plan.ajustar).toEqual([]);
  });
});

describe("después de soltar las facturas", () => {
  it("⭐ Wherex queda en 2.125 cobrado + 2.975 = 5.100", () => {
    /* Soltar = quitarle la factura Y devolverlo a PROGRAMADO. Hacen falta las DOS cosas: con
       solo quitarle la factura, `esIntocable` sigue siendo true por el estado. */
    const liberados = COBROS_WHEREX.map((c) =>
      c.id === "c2" || c.id === "c3" ? { ...c, estado: "PROGRAMADO", fechaEmision: null, promesaPago: null } : c,
    );
    const plan = planDeCambios(DRAFTS_WHEREX, liberados);

    expect(plan.ajustar).toEqual([
      { cobroId: "c2", numCuota: 2, deMonto: 2125, aMonto: 2975, deFecha: "2026-06-15", aFecha: "2026-06-15" },
    ]);
    expect(plan.borrar.map((b) => b.numCuota)).toEqual([3, 4]);
    /* El #1 sigue bloqueado —está cobrado— pero coincide, así que no es trabajo pendiente. */
    expect(plan.bloqueados.map((b) => b.numCuota)).toEqual([1]);
    expect(plan.bloqueados[0]?.coincide).toBe(true);
    expect(2125 + 2975).toBe(5100);
  });

  it("⛔ quitar SOLO la factura no alcanza: el estado lo sigue bloqueando", () => {
    /* Es el nudo del caso real, y la razón por la que «Revertir factura» no arreglaba nada:
       limpia la fecha de emisión y no toca el estado. */
    const soloSinFactura = COBROS_WHEREX.map((c) => (c.id === "c2" ? { ...c, fechaEmision: null } : c));
    const plan = planDeCambios(DRAFTS_WHEREX, soloSinFactura);
    const c2 = plan.bloqueados.find((b) => b.numCuota === 2);
    expect(c2?.motivo, "sigue bloqueado, ahora por el estado").toBe("en-curso");
    expect(plan.ajustar, "el motor todavía no puede ajustarlo").toEqual([]);
  });
});

describe("⚠ el motivo del bloqueo: la etiqueta que mentía", () => {
  it("⛔ un POR_COBRAR SIN factura no se rotula «facturado»", () => {
    /* Hasta el 2026-09-04 sí, y la pantalla mandaba a revertir una factura que no existe —
       una instrucción irrealizable que dejaba a la persona igual de trabada que antes. */
    const c = cobro({ id: "x", numCuota: 1, estado: "POR_COBRAR", fechaEmision: null });
    expect(bloqueoDe(c)).toBe("en-curso");
    expect(BLOQUEO_LABEL["en-curso"]).toMatch(/sin factura/i);
  });

  it("la factura manda sobre el estado", () => {
    expect(bloqueoDe(cobro({ id: "x", numCuota: 1, estado: "PROGRAMADO", fechaEmision: "2026-06-15" }))).toBe("facturado");
  });

  it("cobrado y manual ganan sobre todo lo demás", () => {
    expect(bloqueoDe(cobro({ id: "x", numCuota: 1, estado: "COBRADO", fechaEmision: "2026-06-15" }))).toBe("cobrado");
    expect(bloqueoDe(cobro({ id: "x", numCuota: 1, origen: "MANUAL", estado: "COBRADO" }))).toBe("manual");
  });

  it("un PROGRAMADO limpio no está bloqueado", () => {
    expect(bloqueoDe(cobro({ id: "x", numCuota: 1 }))).toBeNull();
  });

  it("⛔ todo motivo tiene su etiqueta", () => {
    /* `BLOQUEO_LABEL` es un Record exhaustivo: agregar un motivo sin etiqueta no compila. */
    const motivos: Array<Exclude<Bloqueo, null>> = ["cobrado", "facturado", "en-curso", "manual"];
    for (const m of motivos) expect(BLOQUEO_LABEL[m].length).toBeGreaterThan(3);
  });
});

describe("⚠⚠ y el falso positivo que se comía tres plantillas de cuatro", () => {
  /**
   * `generateCobros` nunca usa las filas `CuotaPlan` directamente: las expande según la
   * plantilla. Comparar contra las crudas daba diferencias donde el motor no ve ninguna.
   */
  it("PAREJO: el motor ignora las cuotas crudas y calcula total/n — cero diferencias", () => {
    const servicio: ServicioEngineInput = {
      id: "s",
      montoTotal: 6900,
      moneda: "USD",
      fechaInicioFacturacion: "2026-06-15",
      duracionMeses: 3,
      diaCobroAncla: 15,
    };
    const plan: PlanEngineInput = { template: "PAREJO", numCuotas: 3, cuotas: [] };
    const drafts = materializeCobros(servicio, plan, { todayISO: "2026-09-04" });
    expect(drafts.map((d) => d.monto)).toEqual([2300, 2300, 2300]);

    const cobros = drafts.map((d, i) =>
      cobro({ id: `c${i}`, numCuota: d.numCuota, monto: d.monto, periodo: d.periodo, fechaProgramadaISO: d.fechaProgramadaISO }),
    );
    /* Con las cuotas crudas —que acá son CERO filas— los tres cobros habrían salido como que
       «sobran», y el aviso habría mandado a arreglar un cronograma que está perfecto. */
    expect(planDeCambios(drafts, cobros).hay, "PAREJO en paz no debe reportar nada").toBe(false);
  });

  it("ENTRADA_Y_RESTO: el valor de la cuota es un PORCENTAJE, no un monto", () => {
    const servicio: ServicioEngineInput = {
      id: "s",
      montoTotal: 10000,
      moneda: "USD",
      fechaInicioFacturacion: "2026-06-15",
      duracionMeses: 3,
      diaCobroAncla: 15,
    };
    /* «70 % de entrada por descuento y 30 % al terminar» — el caso documentado en el repo. */
    const plan: PlanEngineInput = {
      template: "ENTRADA_Y_RESTO",
      numCuotas: 3,
      cuotas: [{ orden: 1, base: "PORCENTAJE", valor: 70, offsetMeses: 0 }],
    };
    const drafts = materializeCobros(servicio, plan, { todayISO: "2026-09-04" });
    expect(drafts[0]?.monto, "la entrada es el 70 % de 10.000").toBe(7000);

    const cobros = drafts.map((d, i) =>
      cobro({ id: `c${i}`, numCuota: d.numCuota, monto: d.monto, periodo: d.periodo, fechaProgramadaISO: d.fechaProgramadaISO }),
    );
    /* Comparando contra la cuota cruda, el «70» se leía como $70 contra un cobro de $7.000:
       una diferencia de 6.930 que no existe. */
    expect(planDeCambios(drafts, cobros).hay).toBe(false);
  });
});

describe("los cobros que no cuelgan de ninguna cuota", () => {
  it("un cobro sin numCuota se ignora, igual que en el motor", () => {
    const suelto = cobro({ id: "manual-1", numCuota: null, monto: 999, origen: "MANUAL" });
    const drafts: CobroDraft[] = [{ numCuota: 1, periodo: "2026-05", fechaProgramadaISO: "2026-05-15", monto: 2125 }];
    const plan = planDeCambios(drafts, [suelto]);
    expect(plan.borrar).toEqual([]);
    expect(plan.bloqueados).toEqual([]);
    expect(plan.crear).toHaveLength(1);
  });
});

/**
 * ── ⭐ EL NÚMERO QUE SE MIRA ANTES DE CONFIRMAR ─────────────────────────────────
 * El diálogo recalcula el total en vivo a medida que se elige factura por factura. Es la única
 * cifra que hace visible para qué sirve soltar una, y la última que alguien lee antes de tocar
 * plata. Que salga bien en los extremos no alcanza: lo que la persona ve casi siempre es un
 * estado intermedio.
 */
describe("⭐ el total en vivo, a medida que se elige", () => {
  const plan = planDeCambios(DRAFTS_WHEREX, COBROS_WHEREX);
  const id = (n: number) => plan.bloqueados.find((b) => b.numCuota === n)!.cobroId;

  it("sin soltar nada da exactamente `sumaSiNoSeLibera`", () => {
    expect(sumaConDecisiones(plan, new Set())).toBe(plan.sumaSiNoSeLibera);
    expect(sumaConDecisiones(plan, new Set())).toBe(6375);
  });

  it("soltando todo lo soltable da exactamente `sumaSiSeLibera`", () => {
    const soltables = new Set(plan.bloqueados.filter((b) => b.liberable).map((b) => b.cobroId));
    expect(sumaConDecisiones(plan, soltables)).toBe(plan.sumaSiSeLibera);
    expect(sumaConDecisiones(plan, soltables)).toBe(5100);
  });

  /* ⚠ Los pasos de en medio son lo que la persona mira mientras decide. Cada uno se puede
     comprobar a mano contra los cobros de arriba, que es todo el punto de tenerlos escritos. */
  it("soltando SOLO el #2 quedan 4.250: sube a 2.975, y el #3 sigue existiendo", () => {
    // 2.125 (#1 cobrado) + 2.975 (#2 pasa a seguir el acuerdo) − 2.125 … el #3 sobrevive:
    // 5.100 del acuerdo + 2.125 del #3, que el acuerdo ya no pide.
    expect(sumaConDecisiones(plan, new Set([id(2)]))).toBe(7225);
  });

  it("⚠ soltando SOLO el #3 NO cuadra: sigue en 5.100 − 850 = 4.250", () => {
    /* Es el caso que engaña: se soltó una factura, el total bajó, y aun así no cuadra porque el
       #2 quedó congelado en 2.125 contra los 2.975 que el acuerdo pide. Sin este número en
       pantalla, confirmar acá se siente resuelto. */
    expect(sumaConDecisiones(plan, new Set([id(3)]))).toBe(4250);
  });

  it("soltar el cobro COBRADO no cambia nada: ya coincide con el acuerdo", () => {
    /* La API lo rechaza con 409 antes de llegar acá, pero el número tampoco tiene que moverse:
       la cuota 1 pide 2.125 y el cobro vale 2.125. */
    expect(sumaConDecisiones(plan, new Set([id(1)]))).toBe(6375);
  });

  it("un cronograma que ya cuadra da el total del acuerdo, suelte lo que suelte", () => {
    const yaCuadra = planDeCambios(DRAFTS_WHEREX, [
      cobro({ id: "x1", numCuota: 1, periodo: "2026-05", estado: "COBRADO", fechaEmision: "2026-05-15" }),
      cobro({ id: "x2", numCuota: 2, periodo: "2026-06", monto: 2975, fechaProgramadaISO: "2026-06-15" }),
    ]);
    expect(yaCuadra.sumaDelPlan).toBe(5100);
    expect(sumaConDecisiones(yaCuadra, new Set())).toBe(5100);
    expect(sumaConDecisiones(yaCuadra, new Set(["x1"]))).toBe(5100);
  });
});

/**
 * ── ⚠⚠ TEAMNET: LA PROMESA QUE NO SE PODÍA CUMPLIR ─────────────────────────────
 * Segundo caso real de producción, y el que destapó que `sumaSiSeLibera` tenía su propia
 * fórmula. Dos cobros ya COBRADOS de $2.000 cada uno contra un acuerdo que ahora pide $1.875:
 * la plata entró, son intocables, y **no hay nada que soltar**. Aun así el preview prometía
 * $7.500 — o sea prometía cuadrar sin que existiera ninguna acción que lo lograra.
 *
 * El caso Wherex no lo cazaba porque ahí el único bloqueado no liberable ya coincidía con el
 * plan, y una corrección de cero es invisible.
 */
describe("⚠⚠ Teamnet — cuando no hay nada que soltar, el número tiene que decirlo", () => {
  const SERVICIO_TEAMNET: ServicioEngineInput = {
    id: "svc-teamnet",
    montoTotal: 7500,
    moneda: "USD",
    fechaInicioFacturacion: "2026-01-15",
    duracionMeses: 4,
    diaCobroAncla: 15,
  };
  /** El acuerdo nuevo: 4 cuotas parejas de 1.875. Los dos primeros cobros ya se pagaron a 2.000. */
  const PLAN_TEAMNET: PlanEngineInput = { template: "PAREJO", numCuotas: 4, cuotas: [] };
  const DRAFTS = materializeCobros(SERVICIO_TEAMNET, PLAN_TEAMNET, { todayISO: "2026-09-04" });

  const COBROS: CobroMaterializado[] = [
    cobro({ id: "t1", numCuota: 1, periodo: "2026-01", monto: 2000, estado: "COBRADO", fechaEmision: "2026-01-15", fechaProgramadaISO: "2026-01-15" }),
    cobro({ id: "t2", numCuota: 2, periodo: "2026-02", monto: 2000, estado: "COBRADO", fechaEmision: "2026-02-15", fechaProgramadaISO: "2026-02-15" }),
    cobro({ id: "t3", numCuota: 3, periodo: "2026-03", monto: 2000, fechaProgramadaISO: "2026-03-15" }),
    cobro({ id: "t4", numCuota: 4, periodo: "2026-04", monto: 2000, fechaProgramadaISO: "2026-04-15" }),
  ];

  const plan = planDeCambios(DRAFTS, COBROS);

  it("⭐ soltar todo lo soltable NO llega al acuerdo, porque no hay nada soltable", () => {
    expect(plan.sumaDelPlan, "lo que vale el servicio").toBe(7500);
    expect(plan.bloqueados.every((b) => !b.liberable), "ninguno se puede soltar").toBe(true);
    /* Los dos escenarios son el MISMO número, y eso es la verdad: no hay nada que elegir. */
    expect(plan.sumaSiNoSeLibera).toBe(7750);
    expect(plan.sumaSiSeLibera, "el piso real, no el deseado").toBe(7750);
  });

  it("las tres sumas y el total en vivo son la misma función", () => {
    const liberables = new Set(plan.bloqueados.filter((b) => b.liberable).map((b) => b.cobroId));
    expect(sumaConDecisiones(plan, new Set())).toBe(plan.sumaSiNoSeLibera);
    expect(sumaConDecisiones(plan, liberables)).toBe(plan.sumaSiSeLibera);
  });

  it("el motor sí ajusta las dos cuotas que todavía no se cobraron", () => {
    /* La diferencia de 250 no tiene salida en este diálogo, pero lo que SÍ se puede arreglar
       se arregla igual: mandar a alguien a no hacer nada tampoco sirve. */
    expect(plan.ajustar.map((a) => a.numCuota)).toEqual([3, 4]);
    expect(plan.ajustar.every((a) => a.aMonto === 1875)).toBe(true);
  });
});
