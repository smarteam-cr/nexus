/**
 * lib/cobranza/plan-vs-cobros.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/plan-vs-cobros.test.ts --project unit`.
 *
 * Los dos casos centrales son los REALES, leídos de producción el 2026-09-02. No son
 * ejemplos: son exactamente los dos clientes que Alexander reportó, con sus números.
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
    cobro(1, 2125, "COBRADO", "2026-07-15"),
    cobro(2, 2125, "POR_COBRAR", "2026-08-15"),
    cobro(3, 2125, "POR_COBRAR", "2026-08-15"),
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

  it("dice exactamente qué sobra y qué monto quedó viejo", () => {
    const d = compararPlanConCobros(PLAN, COBROS);
    expect(d.sobran).toEqual([3, 4]); // las cuotas que Alexander quitó
    expect(d.faltan).toEqual([]);
    expect(d.montosQueNoCoinciden).toEqual([
      // La cuota 2 pasó de 2125 a 2975 en el plan, y su cobro ya está facturado.
      { numCuota: 2, enElPlan: 2975, enElCobro: 2125, intocable: true },
    ]);
  });

  it("⚠ y avisa que REGENERAR NO ALCANZA — es lo que evita mandarlo a un botón inútil", () => {
    /* El cobro 3 tiene factura emitida y el 1 está cobrado: `reconcileCobros` los deja
       intactos. Apretar «Generar cobros» borraría solo el 4 y dejaría 3 cobros donde el plan
       pide 2, con la cuota 2 todavía en 2125. Decirle "regenerá" sería mentirle. */
    const d = compararPlanConCobros(PLAN, COBROS);
    expect(d.intocables).toEqual([1, 2, 3]);
    expect(d.regenerarAlcanza).toBe(false);
  });
});

describe("Real Shipping & Trade — el otro caso reportado", () => {
  /** Plan activo: 3 cuotas por $4.000. Cobros: 3 por $6.000, ninguno facturado. */
  const PLAN = [
    { orden: 1, valor: 1500 },
    { orden: 2, valor: 1500 },
    { orden: 3, valor: 1000 },
  ];
  const COBROS = [cobro(1, 2000, "POR_COBRAR"), cobro(2, 2000, "POR_COBRAR"), cobro(3, 2000, "POR_COBRAR")];

  it("mismo número de cuotas pero todos los montos viejos", () => {
    const d = compararPlanConCobros(PLAN, COBROS);
    expect(d.hay).toBe(true);
    expect(d.sobran).toEqual([]);
    expect(d.faltan).toEqual([]);
    expect(d.sumaDelPlan).toBe(4000);
    expect(d.sumaDeLosCobros).toBe(6000);
    expect(d.montosQueNoCoinciden.map((m) => m.numCuota)).toEqual([1, 2, 3]);
  });

  it("⚠ acá TAMPOCO alcanza con regenerar, y esto lo descubrió esta prueba", () => {
    /* Yo esperaba que este caso sí se arreglara solo, porque ningún cobro tiene factura
       emitida. Me equivoqué: `esIntocable` protege todo lo que no esté en PROGRAMADO, y los
       tres están en POR_COBRAR. O sea que **en los DOS clientes reportados el botón
       «Generar cobros» no arregla nada** — y esa es justamente la frase que la pantalla
       tiene que decir en vez de mandar a apretarlo. */
    const d = compararPlanConCobros(PLAN, COBROS);
    expect(d.intocables).toEqual([1, 2, 3]);
    expect(d.regenerarAlcanza).toBe(false);
  });
});

describe("cuándo NO hay que molestar a nadie", () => {
  it("plan y cobros alineados: sin desfase", () => {
    const d = compararPlanConCobros(
      [
        { orden: 1, valor: 1000 },
        { orden: 2, valor: 500 },
      ],
      [cobro(1, 1000, "COBRADO", "2026-01-15"), cobro(2, 500)],
    );
    expect(d.hay).toBe(false);
    expect(d.regenerarAlcanza).toBe(false); // no hay nada que regenerar
  });

  it("una diferencia de un céntimo es redondeo, no un cambio de plan", () => {
    const d = compararPlanConCobros([{ orden: 1, valor: 1000 }], [cobro(1, 1000.01)]);
    expect(d.hay).toBe(false);
  });

  it("un cobro SIN numCuota no se compara ni cuenta como sobrante", () => {
    /* Suscripciones y ajustes manuales no cuelgan de una cuota del plan. Contarlos como
       sobrantes pondría un aviso rojo permanente en toda cuenta con suscripción. */
    const d = compararPlanConCobros([{ orden: 1, valor: 1000 }], [cobro(1, 1000), cobro(null, 300)]);
    expect(d.hay).toBe(false);
    expect(d.cobrosVivos).toBe(1);
    expect(d.sobran).toEqual([]);
  });

  it("un servicio sin cobros todavía: faltan todas, y regenerar es justo lo que hay que hacer", () => {
    const d = compararPlanConCobros([{ orden: 1, valor: 10 }, { orden: 2, valor: 20 }], []);
    expect(d.faltan).toEqual([1, 2]);
    expect(d.regenerarAlcanza).toBe(true);
  });
});

describe("qué vuelve intocable a un cobro", () => {
  it("cobrado, facturado o creado a mano — la misma regla que el motor", () => {
    expect(esIntocable(cobro(1, 100, "PROGRAMADO", null, "PLAN"))).toBe(false);
    expect(esIntocable(cobro(1, 100, "COBRADO", null, "PLAN"))).toBe(true);
    expect(esIntocable(cobro(1, 100, "POR_COBRAR", null, "PLAN"))).toBe(true);
    expect(esIntocable(cobro(1, 100, "PROGRAMADO", "2026-01-01", "PLAN"))).toBe(true);
    expect(esIntocable(cobro(1, 100, "PROGRAMADO", null, "MANUAL"))).toBe(true);
  });

  it("⛔ un sobrante intocable hace que regenerar NO alcance", () => {
    /* Es la mitad del caso Wherex aislada: si el cobro que sobra ya está facturado, el motor
       lo manda a `untouched` y el desfase sobrevive a la regeneración. */
    const d = compararPlanConCobros([{ orden: 1, valor: 100 }], [cobro(1, 100), cobro(2, 50, "POR_COBRAR")]);
    expect(d.sobran).toEqual([2]);
    expect(d.regenerarAlcanza).toBe(false);
  });
});
