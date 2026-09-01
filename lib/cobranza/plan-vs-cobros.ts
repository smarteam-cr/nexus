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

/**
 * Por qué el motor no va a tocar este cobro al regenerar. `null` = sí lo arregla.
 *
 * ⚠ Hubo un cuarto motivo, `importado`, porque `reconcileCobros` solo borraba sobrantes de
 * origen PLAN o CATCH_UP y los 202 cobros de la base son IMPORTACION. Esa condición se sacó
 * del motor —no protegía nada que `esIntocable` no proteja ya— así que el motivo desapareció
 * con ella. Si vuelve al motor, tiene que volver acá: la pantalla promete lo que el motor hace.
 */
export type Bloqueo = "cobrado" | "facturado" | "manual" | null;

export interface Diferencia {
  numCuota: number;
  /** `monto` = está en los dos y no coinciden · `sobra` = solo en cobros · `falta` = solo en el plan. */
  tipo: "monto" | "sobra" | "falta";
  enElPlan: number | null;
  enElCobro: number | null;
  bloqueo: Bloqueo;
}

export interface Desfase {
  hay: boolean;
  cuotasEnElPlan: number;
  cobrosVivos: number;
  sumaDelPlan: number;
  sumaDeLosCobros: number;
  /** Una fila por diferencia, ordenada por cuota. Es lo que la pantalla pinta. */
  diferencias: Diferencia[];
  /** Cuántas de esas diferencias SÍ arregla el botón «Generar cobros». */
  lasArreglaRegenerar: number;
  /** Las que quedan a mano sí o sí. */
  requierenManual: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** La misma regla que `reconcileCobros`: un cobro deja de ser reescribible acá. */
export function esIntocable(c: CobroMaterializado): boolean {
  return c.estado !== "PROGRAMADO" || c.fechaEmision !== null || c.origen === "MANUAL";
}

/**
 * Por qué el motor no va a poder arreglar esta diferencia al regenerar. Es `esIntocable`
 * desglosado en su motivo, para poder decirlo en pantalla en vez de un "no se puede" pelado.
 */
function bloqueoDe(c: CobroMaterializado): Bloqueo {
  if (c.origen === "MANUAL") return "manual";
  if (c.estado === "COBRADO") return "cobrado";
  if (c.estado !== "PROGRAMADO" || c.fechaEmision !== null) return "facturado";
  return null;
}

export function compararPlanConCobros(
  cuotas: readonly CuotaDelPlan[],
  cobros: readonly CobroMaterializado[],
): Desfase {
  // Un cobro sin numCuota no cuelga de ninguna cuota del plan (suscripción, ajuste manual):
  // no se lo compara ni se lo cuenta como sobrante.
  const conCuota = cobros.filter((c) => c.numCuota !== null) as (CobroMaterializado & { numCuota: number })[];
  const porCuota = new Map(conCuota.map((c) => [c.numCuota, c]));
  const ordenes = new Set(cuotas.map((q) => q.orden));

  const diferencias: Diferencia[] = [];

  for (const q of cuotas) {
    const c = porCuota.get(q.orden);
    if (!c) {
      diferencias.push({ numCuota: q.orden, tipo: "falta", enElPlan: round2(q.valor), enElCobro: null, bloqueo: null });
      continue;
    }
    // Un céntimo de diferencia es ruido de redondeo, no un cambio de plan.
    if (Math.abs(round2(q.valor) - round2(c.monto)) <= 0.01) continue;
    diferencias.push({
      numCuota: q.orden,
      tipo: "monto",
      enElPlan: round2(q.valor),
      enElCobro: round2(c.monto),
      bloqueo: bloqueoDe(c),
    });
  }

  for (const c of conCuota) {
    if (ordenes.has(c.numCuota)) continue;
    diferencias.push({
      numCuota: c.numCuota,
      tipo: "sobra",
      enElPlan: null,
      enElCobro: round2(c.monto),
      bloqueo: bloqueoDe(c),
    });
  }

  diferencias.sort((a, b) => a.numCuota - b.numCuota);

  return {
    hay: diferencias.length > 0,
    cuotasEnElPlan: cuotas.length,
    cobrosVivos: conCuota.length,
    sumaDelPlan: round2(cuotas.reduce((n, q) => n + q.valor, 0)),
    sumaDeLosCobros: round2(conCuota.reduce((n, c) => n + c.monto, 0)),
    diferencias,
    lasArreglaRegenerar: diferencias.filter((d) => d.bloqueo === null).length,
    requierenManual: diferencias.filter((d) => d.bloqueo !== null).length,
  };
}
