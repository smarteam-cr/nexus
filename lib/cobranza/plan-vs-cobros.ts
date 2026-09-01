/**
 * lib/cobranza/plan-vs-cobros.ts
 *
 * Si el cronograma que se ve en pantalla todavía es de un plan anterior — y si regenerarlo
 * alcanzaría para arreglarlo.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * El plan de pago (`PlanDePago` + `CuotaPlan`) es la INTENCIÓN; los `Cobro` son la copia
 * materializada, y es de esa copia que salen el cronograma, la cola, la cartera, las alertas
 * y el dashboard de gerencia. Guardar el plan **no toca los cobros a propósito**: quién y
 * cuándo se re-materializa lo decide una persona, porque reescribir un cobro ya facturado no
 * puede pasar solo.
 *
 * ⚠ El defecto no era ese diseño: era que **nadie lo decía**. Alexander cortó el contrato de
 * Wherex a 2 cuotas por $5.100, guardó, vio un toast verde… y el cronograma siguió mostrando
 * 4 cobros por $8.500. Guardó SEIS veces entre las 20:40 y las 20:52 creyendo que no tomaba.
 * El guardado funcionó las seis. Lo que faltaba era la frase "esto todavía no llegó a los
 * cobros".
 *
 * ⚠⚠ Y avisar no alcanza: hay que decir si regenerar SIRVE. Un cobro ya cobrado o ya
 * facturado es intocable para `reconcileCobros` — regenerar no lo va a cambiar. Mandar a
 * alguien a apretar un botón que no puede arreglar su caso es peor que no decirle nada.
 *
 * Módulo PURO: sin Prisma, sin red, sin reloj.
 */

export interface CuotaDelPlan {
  orden: number;
  valor: number;
}

export interface CobroMaterializado {
  numCuota: number | null;
  monto: number;
  estado: string;
  /** Con fecha de emisión ya hay una factura afuera: el cobro deja de ser reescribible. */
  fechaEmision: string | null;
  origen: string;
}

export interface MontoQueNoCoincide {
  numCuota: number;
  enElPlan: number;
  enElCobro: number;
  /** Una regeneración NO puede corregirlo: el cobro está protegido. */
  intocable: boolean;
}

export interface Desfase {
  hay: boolean;
  cuotasEnElPlan: number;
  cobrosVivos: number;
  sumaDelPlan: number;
  sumaDeLosCobros: number;
  /** Cobros cuya cuota el plan ya no tiene. */
  sobran: number[];
  /** Cuotas del plan que todavía no tienen cobro. */
  faltan: number[];
  montosQueNoCoinciden: MontoQueNoCoincide[];
  /**
   * Cobros que una regeneración NO va a tocar: ya cobrados, ya facturados, o creados a mano.
   * Es la misma regla que `esIntocable` en `engine.ts` — si esa cambia, esta tiene que
   * cambiar con ella, o la pantalla prometería algo que el motor no hace.
   */
  intocables: number[];
  /** ¿Alcanza con apretar «Generar cobros», o hace falta intervenir a mano? */
  regenerarAlcanza: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** La misma regla que `reconcileCobros`: un cobro deja de ser reescribible acá. */
export function esIntocable(c: CobroMaterializado): boolean {
  return c.estado !== "PROGRAMADO" || c.fechaEmision !== null || c.origen === "MANUAL";
}

export function compararPlanConCobros(
  cuotas: readonly CuotaDelPlan[],
  cobros: readonly CobroMaterializado[],
): Desfase {
  // Un cobro sin numCuota no pertenece a ninguna cuota del plan (suscripción, ajuste
  // manual): no se lo compara contra el plan ni se lo cuenta como sobrante.
  const conCuota = cobros.filter((c) => c.numCuota !== null) as (CobroMaterializado & { numCuota: number })[];
  const porCuota = new Map(conCuota.map((c) => [c.numCuota, c]));
  const ordenes = new Set(cuotas.map((q) => q.orden));

  const sobran = conCuota.filter((c) => !ordenes.has(c.numCuota)).map((c) => c.numCuota).sort((a, b) => a - b);
  const faltan = cuotas.filter((q) => !porCuota.has(q.orden)).map((q) => q.orden).sort((a, b) => a - b);

  const montosQueNoCoinciden: MontoQueNoCoincide[] = [];
  for (const q of cuotas) {
    const c = porCuota.get(q.orden);
    if (!c) continue;
    // Un céntimo de diferencia es ruido de redondeo, no un cambio de plan.
    if (Math.abs(round2(q.valor) - round2(c.monto)) <= 0.01) continue;
    montosQueNoCoinciden.push({
      numCuota: q.orden,
      enElPlan: round2(q.valor),
      enElCobro: round2(c.monto),
      intocable: esIntocable(c),
    });
  }

  const intocables = conCuota.filter(esIntocable).map((c) => c.numCuota).sort((a, b) => a - b);
  const setIntocables = new Set(intocables);

  const hay = sobran.length > 0 || faltan.length > 0 || montosQueNoCoinciden.length > 0;

  /**
   * Regenerar alcanza solo si NINGUNA de las diferencias cae sobre un cobro protegido.
   * Un sobrante intocable no se borra y un monto intocable no se reescribe: en esos casos la
   * pantalla tiene que mandar a resolverlo a mano, no al botón.
   */
  const regenerarAlcanza =
    hay &&
    !sobran.some((n) => setIntocables.has(n)) &&
    !montosQueNoCoinciden.some((m) => m.intocable);

  return {
    hay,
    cuotasEnElPlan: cuotas.length,
    cobrosVivos: conCuota.length,
    sumaDelPlan: round2(cuotas.reduce((n, q) => n + q.valor, 0)),
    sumaDeLosCobros: round2(conCuota.reduce((n, c) => n + c.monto, 0)),
    sobran,
    faltan,
    montosQueNoCoinciden,
    intocables,
    regenerarAlcanza,
  };
}
