/**
 * lib/cobranza/plan-vs-cobros.ts
 *
 * Qué le va a pasar a cada cobro si se regenera desde el plan activo.
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
 * El guardado funcionó las seis. Lo que faltaba era la frase «esto todavía no llegó a los
 * cobros».
 *
 * ⚠⚠ Y avisar no alcanza: hay que decir si regenerar SIRVE, y si no sirve, QUÉ hay que soltar
 * para que sirva. Mandar a alguien a apretar un botón que no puede arreglar su caso es peor
 * que no decirle nada.
 *
 * ── QUIÉN LO USA, Y POR QUÉ TIENE QUE SER UNO SOLO ──────────────────────────────
 * El aviso del panel de la cuenta y el diálogo que pide confirmación antes de liberar. Si cada
 * uno calculara por su cuenta, uno diría «esto se arregla solo» y el otro listaría el mismo
 * cobro como bloqueado — y ninguno de los dos sería creíble.
 *
 * ── ⚠⚠ RECIBE LOS DRAFTS DEL MOTOR, NO LAS CUOTAS DEL PLAN ──────────────────────
 * Hasta el 2026-09-04 esto comparaba las filas `CuotaPlan` crudas contra los montos de los
 * cobros. Pero `generateCobros` **nunca usa esas filas directamente**: pasa por
 * `expandPlanCuotas`, que las interpreta según la plantilla — `PAREJO` y `SUSCRIPCION` las
 * ignoran por completo y calculan el monto solas, y `ENTRADA_Y_RESTO` trata el valor como un
 * PORCENTAJE. O sea que el aviso era **falso positivo garantizado en tres de las cuatro
 * plantillas**, incluido el caso documentado de «70 % de entrada y 30 % al terminar».
 *
 * Recibiendo los drafts, lo que se compara es exactamente lo que el motor va a escribir.
 *
 * Módulo PURO: sin Prisma, sin red, sin reloj.
 */
import { createHash } from "node:crypto";
import { esIntocable } from "./engine";
import type { CobroDraft, ServicioEngineInput } from "./engine";

/* ── Lo que entra ───────────────────────────────────────────────────────────────── */

export interface CobroMaterializado {
  id: string;
  numCuota: number | null;
  periodo: string;
  monto: number;
  estado: string;
  /** Con fecha de emisión ya hay una factura afuera: el cobro deja de ser reescribible. */
  fechaEmision: string | null;
  origen: string;
  fechaProgramadaISO: string;
  /** Una promesa viva calla las alertas del cobro; al cambiar el acuerdo deja de tener sentido. */
  promesaPago?: string | null;
}

/* ── Por qué un cobro no se puede reescribir ────────────────────────────────────── */

/**
 * `null` = el motor lo arregla solo al regenerar.
 *
 * ⚠ `en-curso` existe desde el 2026-09-04 y no es un matiz. Antes un cobro en `POR_COBRAR`
 * **sin factura** se rotulaba `facturado`, y la pantalla mandaba a revertir una factura que no
 * existe — una instrucción literalmente irrealizable, que dejaba a la persona igual de trabada
 * que antes del aviso.
 *
 * ⚠ Hubo también un motivo `importado`, porque `reconcileCobros` solo borraba sobrantes de
 * origen PLAN o CATCH_UP y los 202 cobros de la base son IMPORTACION. Esa condición se sacó del
 * motor —no protegía nada que `esIntocable` no proteja ya— y el motivo se fue con ella.
 */
export type Bloqueo = "cobrado" | "facturado" | "en-curso" | "manual" | null;

/**
 * Lo que se le muestra a la persona. Vive ACÁ y no en el componente: como `Record` exhaustivo
 * sobre `Bloqueo`, agregar un motivo sin su etiqueta pasa a ser un error de compilación en vez
 * de un hueco en pantalla.
 */
export const BLOQUEO_LABEL: Record<Exclude<Bloqueo, null>, string> = {
  cobrado: "ya cobrado",
  facturado: "ya facturado",
  "en-curso": "en curso, sin factura emitida",
  manual: "creado a mano",
};

/**
 * Cuáles se pueden soltar. Lo cobrado no —la plata entró, es otra decisión— y lo manual
 * tampoco: regenerar no lo iba a tocar igual, así que liberarlo no lo vuelve alcanzable.
 */
export const LIBERABLES: ReadonlySet<Exclude<Bloqueo, null>> = new Set(["facturado", "en-curso"]);

/**
 * `esIntocable` desglosado en su motivo, para poder decirlo en pantalla en vez de un «no se
 * puede» pelado. El orden importa: MANUAL y COBRADO son irreversibles acá; la factura manda
 * sobre el estado; y recién al final queda «salió de PROGRAMADO sin factura».
 */
export function bloqueoDe(c: CobroMaterializado): Bloqueo {
  if (c.origen === "MANUAL") return "manual";
  if (c.estado === "COBRADO") return "cobrado";
  if (c.fechaEmision !== null) return "facturado";
  if (c.estado !== "PROGRAMADO") return "en-curso";
  return null;
}

/* ── Lo que sale ────────────────────────────────────────────────────────────────── */

export interface CobroBloqueado {
  cobroId: string;
  numCuota: number;
  periodo: string;
  monto: number;
  estado: string;
  fechaEmision: string | null;
  tienePromesa: boolean;
  motivo: Exclude<Bloqueo, null>;
  /** Cuánto pide el plan para esta cuota. `null` = el plan ya no la pide. */
  montoSegunPlan: number | null;
  /** Ya cuadra con el plan: está bloqueado pero no hay nada que hacer con él. */
  coincide: boolean;
  /** Se le puede quitar la factura y devolverlo a PROGRAMADO. */
  liberable: boolean;
}

export interface AjusteDeCobro {
  cobroId: string;
  numCuota: number;
  deMonto: number;
  aMonto: number;
  deFecha: string;
  aFecha: string;
}

export interface PlanDeCambios {
  hay: boolean;
  crear: Array<{ numCuota: number; monto: number; fechaProgramadaISO: string }>;
  ajustar: AjusteDeCobro[];
  borrar: Array<{ cobroId: string; numCuota: number; monto: number }>;
  sinCambios: string[];
  bloqueados: CobroBloqueado[];

  /** Lo que el plan pide en total. */
  sumaDelPlan: number;
  /**
   * Lo que suman HOY los cobros que el acuerdo gobierna. **Misma base que `sumaDelPlan`**, y por
   * eso vive acá y no se calcula en la pantalla.
   *
   * ⚠ El panel lo sumaba por su cuenta con `servicio.cobros.reduce(...)` sobre la lista cruda:
   * incluía los cobros MANUAL sin `numCuota` —que este módulo ignora a propósito— y los
   * formateaba con la moneda del servicio sin mirar la del cobro. Un pago manual de ₡250.000
   * junto a un acuerdo de $5.100 pintaba «Hoy hay $255.100». Dos números uno al lado del otro,
   * sobre bases distintas, en la caja que existe justamente para decir que algo no cuadra.
   */
  sumaDeLosCobros: number;
  /**
   * Cuántos cobros del servicio no cuelgan de ninguna cuota del acuerdo (manuales, ajustes).
   *
   * ⚠ Se cuentan, NO se suman: pueden estar en otra moneda, y sumarlos sería repetir el mismo
   * error con otro nombre. `convertir()` de lib/finanzas/equilibrio.ts es el único punto de
   * conversión del sistema, y este módulo es puro.
   */
  fueraDelAcuerdo: number;
  /** Lo que quedaría si se confirma SIN soltar nada. */
  sumaSiNoSeLibera: number;
  /** Lo que quedaría soltando todo lo que se puede soltar. */
  sumaSiSeLibera: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** En centavos: 0.1 + 0.2 no es 0.3 en punto flotante, y un descuadre por el decimal 15 no se ve. */
const CENT = (n: number) => Math.round(n * 100);

const NADA_SOLTADO: ReadonlySet<string> = new Set();

/**
 * El total del cronograma soltando exactamente `soltados`. **Es la única definición**: las tres
 * sumas del preview y el número que el diálogo recalcula en vivo salen todas de acá.
 *
 * ── LA REGLA, EN UNA FRASE ──────────────────────────────────────────────────────
 * **El acuerdo se cumple, salvo donde un cobro bloqueado lo impide.** Se arranca de lo que el
 * acuerdo pide y se corrige por cada bloqueado que NO se suelta:
 *   · si el acuerdo pide esa cuota → se queda con su monto de hoy en vez del pedido
 *   · si el acuerdo ya no la pide → sobrevive igual, sumando de más
 * Un bloqueado que SÍ se suelta no corrige nada: pasa a seguir el acuerdo, o desaparece con él.
 */
function sumaCorrigiendo(
  sumaDelPlan: number,
  bloqueados: readonly CobroBloqueado[],
  soltados: ReadonlySet<string>,
): number {
  const correccion = bloqueados
    .filter((b) => !soltados.has(b.cobroId))
    .reduce((n, b) => n + (b.montoSegunPlan === null ? b.monto : b.monto - b.montoSegunPlan), 0);
  return round2(sumaDelPlan + correccion);
}

/**
 * Qué le pasa a cada cobro si se regenera con estos drafts.
 *
 * ⚠ Los cobros sin `numCuota` (suscripciones, ajustes manuales) se ignoran: no cuelgan de
 * ninguna cuota del plan, y `reconcileCobros` tampoco los toca.
 */
export function planDeCambios(
  drafts: readonly CobroDraft[],
  cobros: readonly CobroMaterializado[],
): PlanDeCambios {
  const conCuota = cobros.filter((c): c is CobroMaterializado & { numCuota: number } => c.numCuota !== null);
  const porCuota = new Map(conCuota.map((c) => [c.numCuota, c]));
  const porDraft = new Map(drafts.map((d) => [d.numCuota, d]));

  const crear: PlanDeCambios["crear"] = [];
  const ajustar: AjusteDeCobro[] = [];
  const borrar: PlanDeCambios["borrar"] = [];
  const sinCambios: string[] = [];
  const bloqueados: CobroBloqueado[] = [];

  for (const d of drafts) {
    const c = porCuota.get(d.numCuota);
    if (!c) {
      crear.push({ numCuota: d.numCuota, monto: round2(d.monto), fechaProgramadaISO: d.fechaProgramadaISO });
      continue;
    }
    if (esIntocable(c)) continue; // se clasifica abajo, con su motivo
    if (CENT(c.monto) === CENT(d.monto) && c.fechaProgramadaISO === d.fechaProgramadaISO) {
      sinCambios.push(c.id);
      continue;
    }
    ajustar.push({
      cobroId: c.id,
      numCuota: d.numCuota,
      deMonto: round2(c.monto),
      aMonto: round2(d.monto),
      deFecha: c.fechaProgramadaISO,
      aFecha: d.fechaProgramadaISO,
    });
  }

  for (const c of conCuota) {
    const d = porDraft.get(c.numCuota);
    if (esIntocable(c)) {
      const motivo = bloqueoDe(c);
      /* `esIntocable` es true, así que `bloqueoDe` no puede dar null: las dos leen las mismas
         tres condiciones. La guarda existe para que, si alguien las hace divergir, la fila
         desaparezca de la pantalla en vez de romperla — y el test de equivalencia lo cace. */
      if (motivo === null) continue;
      bloqueados.push({
        cobroId: c.id,
        numCuota: c.numCuota,
        periodo: c.periodo,
        monto: round2(c.monto),
        estado: c.estado,
        fechaEmision: c.fechaEmision,
        tienePromesa: !!c.promesaPago,
        motivo,
        montoSegunPlan: d ? round2(d.monto) : null,
        coincide: !!d && CENT(c.monto) === CENT(d.monto),
        liberable: LIBERABLES.has(motivo),
      });
      continue;
    }
    if (!d) borrar.push({ cobroId: c.id, numCuota: c.numCuota, monto: round2(c.monto) });
  }

  crear.sort((a, b) => a.numCuota - b.numCuota);
  ajustar.sort((a, b) => a.numCuota - b.numCuota);
  borrar.sort((a, b) => a.numCuota - b.numCuota);
  bloqueados.sort((a, b) => a.numCuota - b.numCuota);

  /**
   * ⚠ Los dos escenarios que el diálogo tiene que poder decir. La diferencia entre ellos es lo
   * único que explica para qué sirve soltar una factura — y los dos salen de `sumaCorrigiendo`,
   * la MISMA función que recalcula el total en vivo mientras la persona elige.
   *
   * ⚠⚠ `sumaSiSeLibera` tenía su propia fórmula hasta el 2026-09-04, y estaba mal: daba por
   * hecho que un bloqueado NO liberable que el plan sí pide igual iba a seguir al plan. No
   * puede: es intocable. En Teamnet —dos cobros COBRADOS de 2.000 contra un acuerdo que pide
   * 1.875— prometía 7.500 cuando el piso real es 7.750, o sea prometía cuadrar sin ninguna
   * acción posible que lo lograra. El caso Wherex no lo cazaba porque ahí el único bloqueado no
   * liberable ya coincidía con el plan.
   */
  const sumaDelPlan = round2(drafts.reduce((n, d) => n + d.monto, 0));
  const sumaDeLosCobros = round2(conCuota.reduce((n, c) => n + c.monto, 0));
  const liberables = new Set(bloqueados.filter((b) => b.liberable).map((b) => b.cobroId));
  const sumaSiNoSeLibera = sumaCorrigiendo(sumaDelPlan, bloqueados, NADA_SOLTADO);
  const sumaSiSeLibera = sumaCorrigiendo(sumaDelPlan, bloqueados, liberables);

  return {
    hay: crear.length + ajustar.length + borrar.length + bloqueados.filter((b) => !b.coincide).length > 0,
    crear,
    ajustar,
    borrar,
    sinCambios,
    bloqueados,
    sumaDelPlan,
    sumaDeLosCobros,
    fueraDelAcuerdo: cobros.length - conCuota.length,
    sumaSiNoSeLibera,
    sumaSiSeLibera,
  };
}

/**
 * Lo que sumaría el cronograma soltando EXACTAMENTE estos cobros. Es el número que el diálogo
 * muestra en vivo mientras la persona elige, y el único que hace visible para qué sirve soltar
 * una factura.
 *
 * ⚠ Vive acá y no en el componente por la misma razón que las otras tres sumas: es la cifra que
 * alguien mira antes de confirmar algo con plata adentro, así que tiene que poder probarse.
 *
 * Con `soltados` vacío da `sumaSiNoSeLibera`; con todos los liberables, `sumaSiSeLibera`. No es
 * una coincidencia que se cumpla: las tres son la misma función.
 */
export function sumaConDecisiones(p: PlanDeCambios, soltados: ReadonlySet<string>): number {
  return sumaCorrigiendo(p.sumaDelPlan, p.bloqueados, soltados);
}

/* ── La huella del cronograma ────────────────────────────────────────────────────── */

/** Lo mínimo de un cobro que, si cambia, invalida lo que la persona vio en el diálogo. */
export interface CobroParaHuella {
  id: string;
  estado: string;
  monto: number;
  fechaEmision: string | null;
}

/**
 * La foto de todo lo que produce los números del diálogo, en 32 caracteres.
 *
 * ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────────
 * Entre que alguien abre el diálogo y aprieta confirmar pasan minutos. En el medio, otra
 * pestaña —u otra persona— puede mover algo. Confirmar entonces ejecutaría sobre un estado
 * distinto al que se aprobó, soltando facturas emitidas y escribiendo montos que nadie vio.
 * Si la huella no coincide, el servidor responde 409 en vez de ejecutar.
 *
 * ⚠⚠ Hashea el PLAN, LOS COBROS **y EL SERVICIO**. Los tres, y no los dos primeros: el motor
 * lee además el monto total del servicio, su duración, su fecha de arranque y el día de cobro
 * de la cuenta. Sin ellos, cambiar el «día de cobro» en otra pestaña —un PATCH que no toca ni
 * el plan ni ningún cobro— dejaba la huella idéntica, el 409 no saltaba, y la confirmación
 * corría con TODAS las fechas programadas movidas.
 *
 * ⚠ Vive en el módulo puro y no junto a la transacción que la usa, justamente para que se
 * pueda probar qué la mueve y qué no. Cuando estaba del otro lado, la única forma de saber si
 * cubría algo era leerla.
 *
 * PURA: sin Prisma, sin red, sin reloj. El orden de los cobros no importa — se ordenan acá.
 */
export function huellaDelCronograma(
  planId: string,
  servicio: ServicioEngineInput,
  cobros: readonly CobroParaHuella[],
): string {
  const filas = [...cobros]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => `${c.id}|${c.estado}|${c.monto.toFixed(2)}|${c.fechaEmision ?? ""}`)
    .join(";");
  const entradas = [
    planId,
    servicio.montoTotal.toFixed(2),
    servicio.moneda,
    servicio.fechaInicioFacturacion ?? "",
    servicio.duracionMeses ?? "",
    servicio.diaCobroAncla ?? "",
    filas,
  ].join("::");
  return createHash("sha256").update(entradas).digest("hex").slice(0, 32);
}
