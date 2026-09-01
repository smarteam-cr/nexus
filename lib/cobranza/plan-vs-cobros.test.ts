/**
 * lib/cobranza/plan-vs-cobros.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/plan-vs-cobros.test.ts --project unit`.
 *
 * Los dos casos centrales son REALES, leídos de producción el 2026-09-02: son exactamente los
 * dos clientes que Alexander reportó, con sus números.
 */
import { describe, it, expect } from "vitest";
import { compararPlanConCobros, esIntocable, type CobroMaterializado } from "./plan-vs-cobros";

const cobro = (
  numCuota: number | null,
  monto: number,
  estado = "PROGRAMADO",
  fechaEmision: string | null = null,
  origen = "IMPORTACION",
): CobroMaterializado => ({ numCuota, monto, estado, fechaEmision, origen });

describe("Wherex — el caso que se reportó", () => {
  /**
   * Estado real: el plan ACTIVO dice 2 cuotas por $5.100 (guardado 6 veces entre las 20:40 y
   * las 20:52), y los cobros siguen diciendo 4 por $8.500. El guardado SIEMPRE funcionó.
   */
  const PLAN = [
    { orden: 1, valor: 2125 },
    { orden: 2, valor: 2975 },
  ];
  const COBROS = [
    cobro(1, 2125, "COBRADO", "2026-05-15"),
    cobro(2, 2125, "POR_COBRAR", "2026-06-15"),
    cobro(3, 2125, "POR_COBRAR", "2026-07-15"),
    cobro(4, 2125, "PROGRAMADO", null),
  ];

  it("detecta el desfase que la pantalla no mostraba", () => {
    const d = compararPlanConCobros(PLAN, COBROS);
    expect(d.hay).toBe(true);
    expect(d.cuotasEnElPlan).toBe(2);
    expect(d.cobrosVivos).toBe(4);
    expect(d.sumaDelPlan).toBe(5100);
    expect(d.sumaDeLosCobros).toBe(8500);
  });

  it("da UNA fila por diferencia, que es lo que la pantalla pinta", () => {
    const d = compararPlanConCobros(PLAN, COBROS);
    expect(d.diferencias).toEqual([
      { numCuota: 2, tipo: "monto", enElPlan: 2975, enElCobro: 2125, bloqueo: "facturado" },
      { numCuota: 3, tipo: "sobra", enElPlan: null, enElCobro: 2125, bloqueo: "facturado" },
      { numCuota: 4, tipo: "sobra", enElPlan: null, enElCobro: 2125, bloqueo: null },
    ]);
  });

  it("el #4 SÍ lo borra regenerar: está PROGRAMADO y sin factura", () => {
    /* Antes no: el motor pedía además `origen ∈ {PLAN, CATCH_UP}` y todos los cobros de la
       base son IMPORTACION. Esa condición se sacó (ver engine.test.ts G7-G9), así que el
       único candado es `esIntocable` — y este cobro no lo activa. */
    const d = compararPlanConCobros(PLAN, COBROS);
    expect(d.diferencias.find((x) => x.numCuota === 4)?.bloqueo).toBeNull();
  });

  it("regenerar arregla 1 de las 3; las otras 2 piden revertir la factura primero", () => {
    const d = compararPlanConCobros(PLAN, COBROS);
    expect(d.lasArreglaRegenerar).toBe(1);
    expect(d.requierenManual).toBe(2);
  });
});

describe("Real Shipping & Trade — el otro caso reportado", () => {
  /** Plan activo: 3 cuotas por $4.000. Cobros: 3 por $6.000, todos POR_COBRAR. */
  const PLAN = [
    { orden: 1, valor: 1500 },
    { orden: 2, valor: 1500 },
    { orden: 3, valor: 1000 },
  ];
  const COBROS = [cobro(1, 2000, "POR_COBRAR"), cobro(2, 2000, "POR_COBRAR"), cobro(3, 2000, "POR_COBRAR")];

  it("mismo número de cuotas, los tres montos viejos, ninguno sobra", () => {
    const d = compararPlanConCobros(PLAN, COBROS);
    expect(d.sumaDelPlan).toBe(4000);
    expect(d.sumaDeLosCobros).toBe(6000);
    expect(d.diferencias.map((x) => [x.numCuota, x.tipo, x.enElPlan, x.enElCobro])).toEqual([
      [1, "monto", 1500, 2000],
      [2, "monto", 1500, 2000],
      [3, "monto", 1000, 2000],
    ]);
  });

  it("⚠ acá regenerar sigue sin arreglar nada, y esto lo descubrió esta prueba", () => {
    /* Yo esperaba que este caso sí se arreglara solo porque ningún cobro tiene factura
       emitida. Me equivoqué: `esIntocable` protege todo lo que no esté en PROGRAMADO, y los
       tres están en POR_COBRAR. Hay que revertir la factura de cada uno primero. */
    const d = compararPlanConCobros(PLAN, COBROS);
    expect(d.lasArreglaRegenerar).toBe(0);
    expect(d.diferencias.every((x) => x.bloqueo === "facturado")).toBe(true);
  });
});

describe("cuándo regenerar SÍ sirve", () => {
  it("un servicio sin cobros todavía: faltan todas y ninguna está bloqueada", () => {
    const d = compararPlanConCobros([{ orden: 1, valor: 10 }, { orden: 2, valor: 20 }], []);
    expect(d.diferencias.map((x) => [x.numCuota, x.tipo, x.bloqueo])).toEqual([
      [1, "falta", null],
      [2, "falta", null],
    ]);
    expect(d.lasArreglaRegenerar).toBe(2);
    expect(d.requierenManual).toBe(0);
  });

  it("un cobro PROGRAMADO de origen PLAN sí se actualiza y sí se borra", () => {
    const d = compararPlanConCobros(
      [{ orden: 1, valor: 500 }],
      [cobro(1, 300, "PROGRAMADO", null, "PLAN"), cobro(2, 300, "PROGRAMADO", null, "PLAN")],
    );
    expect(d.diferencias.map((x) => x.bloqueo)).toEqual([null, null]);
    expect(d.lasArreglaRegenerar).toBe(2);
  });

  it("mezcla: unas se arreglan solas y otras no — la pantalla tiene que decir las dos cosas", () => {
    const d = compararPlanConCobros(
      [{ orden: 1, valor: 500 }, { orden: 2, valor: 500 }],
      [cobro(1, 300, "COBRADO", "2026-01-15"), cobro(2, 300, "PROGRAMADO", null, "PLAN")],
    );
    expect(d.lasArreglaRegenerar).toBe(1);
    expect(d.requierenManual).toBe(1);
  });
});

describe("cuándo NO hay que molestar a nadie", () => {
  it("plan y cobros alineados: sin desfase", () => {
    const d = compararPlanConCobros(
      [{ orden: 1, valor: 1000 }, { orden: 2, valor: 500 }],
      [cobro(1, 1000, "COBRADO", "2026-01-15"), cobro(2, 500)],
    );
    expect(d.hay).toBe(false);
    expect(d.diferencias).toEqual([]);
  });

  it("una diferencia de un céntimo es redondeo, no un cambio de plan", () => {
    expect(compararPlanConCobros([{ orden: 1, valor: 1000 }], [cobro(1, 1000.01)]).hay).toBe(false);
  });

  it("un cobro SIN numCuota no se compara ni cuenta como sobrante", () => {
    /* Suscripciones y ajustes manuales no cuelgan de una cuota del plan. Contarlos como
       sobrantes pondría un aviso permanente en toda cuenta con suscripción. */
    const d = compararPlanConCobros([{ orden: 1, valor: 1000 }], [cobro(1, 1000), cobro(null, 300)]);
    expect(d.hay).toBe(false);
    expect(d.cobrosVivos).toBe(1);
  });
});

describe("qué bloquea a un cobro, y por qué motivo", () => {
  it("cada bloqueo tiene su nombre propio", () => {
    const conUn = (c: CobroMaterializado) => compararPlanConCobros([{ orden: 1, valor: 999 }], [c]).diferencias[0]?.bloqueo;
    expect(conUn(cobro(1, 100, "COBRADO", null, "PLAN"))).toBe("cobrado");
    expect(conUn(cobro(1, 100, "POR_COBRAR", null, "PLAN"))).toBe("facturado");
    expect(conUn(cobro(1, 100, "PROGRAMADO", "2026-01-01", "PLAN"))).toBe("facturado");
    expect(conUn(cobro(1, 100, "PROGRAMADO", null, "MANUAL"))).toBe("manual");
    expect(conUn(cobro(1, 100, "PROGRAMADO", null, "PLAN"))).toBeNull();
    expect(conUn(cobro(1, 100, "PROGRAMADO", null, "IMPORTACION"))).toBeNull();
  });

  it("el origen IMPORTACION ya no bloquea nada — ni un monto viejo ni un sobrante", () => {
    /* Los 202 cobros de la base son IMPORTACION. Mientras esa condición estuvo en el motor,
       achicar un plan no borraba nada en producción. Si vuelve al motor, este caso avisa. */
    expect(compararPlanConCobros([{ orden: 1, valor: 999 }], [cobro(1, 100)]).diferencias[0]?.bloqueo).toBeNull();
    expect(compararPlanConCobros([], [cobro(1, 100)]).diferencias[0]?.bloqueo).toBeNull();
  });

  it("`esIntocable` sigue reflejando la regla del motor", () => {
    expect(esIntocable(cobro(1, 100, "PROGRAMADO", null, "PLAN"))).toBe(false);
    expect(esIntocable(cobro(1, 100, "COBRADO", null, "PLAN"))).toBe(true);
    expect(esIntocable(cobro(1, 100, "PROGRAMADO", "2026-01-01", "PLAN"))).toBe(true);
    expect(esIntocable(cobro(1, 100, "PROGRAMADO", null, "MANUAL"))).toBe(true);
  });
});
