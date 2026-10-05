/**
 * lib/finanzas/egresos-nexus.ts — el gasto que el punto de equilibrio lee de Nexus (rediseño de Finanzas, 2026-10-03,
 * decisión 4 de docs/finanzas-rediseno-plan.md, etapa «Gasto sin Excel»).
 *
 * Hasta septiembre de 2026 el gasto de cada mes (herramientas, costos fijos, tarjeta) sale del Excel de egresos
 * (`EgresoMensual`). Desde `EGRESOS_DESDE_NEXUS` sale de lo que se anota en Nexus:
 *   · los RECURRENTES que no son salarios, vigentes en el mes, por lo que cuestan en un mes (un anual pesa 1/12);
 *   · los GASTOS DEL MES (gastos puntuales), sumados por moneda, como costo fijo de operación.
 * La planilla y la reserva de aguinaldo no cambian: ya salían de Nexus.
 *
 * ── CUÁNDO ESTÁ COMPLETO ────────────────────────────────────────────────────────
 * Con el Excel, un mes estaba completo si aparecían los conceptos de siempre. Con Nexus los recurrentes están siempre;
 * lo que puede faltar son los gastos del mes, y eso solo lo sabe quien los anota. Por eso un mes de Nexus está completo
 * cuando tiene las dos quincenas de planilla y quien registra avisó «ya anoté todos los gastos» (o el mes se cerró).
 *
 * ⚠ La tarjeta deja de ser un rubro aparte: en Nexus lo que se paga con tarjeta es un recurrente (ya está en su rubro) o
 * un gasto del mes. Sumarla además contaría dos veces lo mismo, que es justo el solape que el Excel no dejaba medir.
 *
 * ── CADA MES CON LO QUE VALÍA ESE MES (auditoría 2026-10-05) ───────────────────
 * Hasta esta fecha la vigencia y el monto salían de la fila de HOY: pausar un recurrente el 3 de diciembre lo sacaba
 * también de octubre, y un aumento de diciembre reescribía octubre. La historia ya existía en `CostoMovimiento` (cada
 * alta, pausa, reactivación y cambio de monto con su fecha efectiva): ahora se reproduce mes a mes, con el mismo molde
 * que `salarioVigenteEn` (lib/cobranza/calendario-planilla.ts). Ver `montoDelCostoEn`.
 *
 * PURO: sin Prisma ni red (la zona horaria de Costa Rica sale de `Intl`).
 */
import type { CalidadDato, EgresoDeMes, EstadoMes, MonedaEq } from "./equilibrio";
import { EGRESOS_DESDE_NEXUS, montoMensual, type CategoriaSinSalario } from "./gastos";
import { crDateParts } from "@/lib/jobs/time";

/**
 * Un movimiento de la historia del recurrente (`CostoMovimiento`): lo justo para reproducirla mes a mes.
 *
 * ⛔ Sin `montoAnterior` a propósito. Un recurrente que antes fue un salario y se pasó a otra categoría con un cambio de
 * monto deja en ese movimiento el salario como «monto anterior»; por eso tampoco se traen los movimientos con la
 * categoría Salario en su foto. Desde las pantallas de quien registra un salario no se puede reconstruir ni por ahí.
 */
export interface MovimientoDeCosto {
  /** ALTA · BAJA · REACTIVACION · PAUSA · CAMBIO_MONTO · ELIMINACION. */
  tipo: string;
  /** YYYY-MM-DD: cuándo ocurrió de verdad (puede ser retroactiva o futura). */
  fechaEfectiva: string;
  /** El monto DESPUÉS del movimiento, en la frecuencia del costo. */
  monto: number;
}

export interface CostoParaEgreso {
  id: string;
  nombre: string;
  categoria: CategoriaSinSalario;
  monto: number;
  moneda: MonedaEq;
  frecuencia: string;
  activo: boolean;
  /** YYYY-MM-DD o null. */
  finalizadoEl: string | null;
  /** YYYY-MM-DD: el día de Costa Rica en que se cargó en Nexus (`costoParaEgreso`). */
  creadoEl: string;
  /** La historia, en el orden en que se anotó. Vacía = no hay historia que reproducir: manda la fila. */
  movimientos?: readonly MovimientoDeCosto[];
}

/** La fila de un recurrente como sale de la base, con su historia. */
export type FilaDeCostoParaEgreso = Omit<CostoParaEgreso, "creadoEl"> & { createdAt: Date };

/**
 * La fila de la base → lo que lee el egreso. El día de alta es el de COSTA RICA: con la fecha en UTC, un recurrente
 * cargado el 31 de octubre después de las 18:00 quedaba dado de alta el 1 de noviembre y no contaba en octubre.
 */
export function costoParaEgreso(f: FilaDeCostoParaEgreso): CostoParaEgreso {
  const { createdAt, ...resto } = f;
  return { ...resto, creadoEl: crDateParts(createdAt).dateKey };
}

export interface GastoParaEgreso {
  /** YYYY-MM-DD. */
  fecha: string;
  monto: number;
  moneda: MonedaEq;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ¿El gasto de este mes sale de Nexus? */
export function egresoDesdeNexus(periodo: string): boolean {
  return periodo >= EGRESOS_DESDE_NEXUS;
}

type CostoParaVigencia = Pick<CostoParaEgreso, "activo" | "finalizadoEl" | "creadoEl" | "monto" | "movimientos">;

interface EstadoDelCosto {
  prendido: boolean;
  monto: number;
}

/** Los movimientos que prenden, apagan o cambian el monto. La BAJA no está: la manda la fila (ver `montoDelCostoEn`). */
const MUEVEN = new Set(["ALTA", "REACTIVACION", "PAUSA", "CAMBIO_MONTO"]);

/**
 * Cuándo pesa cada movimiento dentro de su día, con los mismos bordes que `salarioVigenteEn`: lo que prende o cambia el
 * monto rige DESDE su fecha («a», el principio del día); la pausa apaga DESPUÉS de la suya («z», el final del día), así
 * que el día de la pausa todavía cuenta.
 */
const instante = (m: MovimientoDeCosto) => `${m.fechaEfectiva}${m.tipo === "PAUSA" ? "z" : "a"}`;

function aplicar(e: EstadoDelCosto, m: MovimientoDeCosto): EstadoDelCosto {
  switch (m.tipo) {
    case "ALTA":
    case "REACTIVACION":
      return { prendido: true, monto: m.monto };
    case "PAUSA":
      return { prendido: false, monto: m.monto };
    case "CAMBIO_MONTO":
      // Un cambio de monto no prende un costo pausado: solo cambia lo que va a costar cuando vuelva.
      return { prendido: e.prendido, monto: m.monto };
    default:
      return e;
  }
}

/**
 * Lo que cuesta el recurrente en el mes, en SU frecuencia (un anual, el monto anual), o null si ese mes no cuenta.
 *
 * Cuenta si ya existía en Nexus ese mes (`creadoEl`), si su baja no es de antes (la baja cuenta su mes entero, como en
 * la caja neta) y si estuvo prendido ALGÚN día del mes según su historia. El monto es el último que rigió mientras
 * estuvo prendido ese mes: un aumento del 15 de diciembre ya es el de diciembre, y no toca octubre.
 *
 * ── LO QUE LA HISTORIA NO PUEDE DECIR (y no se inventa) ──────────────────────────
 *  · Sin movimientos, o con una historia que NO termina como está la fila hoy (un costo que nació pausado anota un
 *    ALTA y nada más; un cambio cargado por fuera de las pantallas no deja huella), manda la fila para todos los meses,
 *    como antes de esta corrección. Un número de hoy aplicado al pasado es una aproximación conocida; uno reconstruido
 *    a ciegas, no.
 *  · La BAJA la manda `finalizadoEl` de la fila, no sus movimientos: corregir la fecha de una baja deja dos BAJA en la
 *    historia, y reproducirlas apagaría el costo desde la primera. Consecuencia asumida: una baja que después se
 *    deshizo cuenta como si no hubiera existido (el hueco entre la baja y la reactivación sí cuenta).
 *  · Si el primer movimiento no es un ALTA (un costo que nació dado de baja anota solo la BAJA), antes de él el costo
 *    se toma prendido con el monto de ese primer movimiento: es lo que decía la fila.
 *  · Un costo que nació pausado anota un ALTA, no una pausa: si después se reactiva, cuenta desde su alta, igual que
 *    antes de esta corrección.
 *  · ⚠ Un recurrente BORRADO no está: la fila ya no existe y su historia queda con `costoId` vacío, sin forma segura de
 *    atarla al costo (el nombre se repite y cambia). Borrarlo lo saca de todos los meses, también de los pasados. Para
 *    que deje de contar desde una fecha, se da de baja; borrar es para lo que se cargó por error.
 */
export function montoDelCostoEn(c: CostoParaVigencia, periodo: string): number | null {
  if (c.creadoEl.slice(0, 7) > periodo) return null;
  if (c.finalizadoEl && c.finalizadoEl.slice(0, 7) < periodo) return null;
  const sinHistoria = c.activo ? c.monto : null;

  // El sort es estable: dos movimientos del mismo día y el mismo borde quedan en el orden en que se anotaron.
  const orden = (c.movimientos ?? [])
    .filter((m) => MUEVEN.has(m.tipo))
    .map((m) => ({ m, t: instante(m) }))
    .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  if (orden.length === 0) return sinHistoria;

  const primero = orden[0]!.m;
  const inicial: EstadoDelCosto = { prendido: primero.tipo !== "ALTA", monto: primero.monto };
  const final = orden.reduce((e, x) => aplicar(e, x.m), inicial);
  if (final.prendido !== c.activo || Math.abs(final.monto - c.monto) > 0.005) return sinHistoria;

  const inicio = `${periodo}-01a`;
  const fin = `${periodo}-31z`; // ningún mes tiene un día después del 31: compara bien como texto
  let e = inicial;
  let i = 0;
  for (; i < orden.length && orden[i]!.t < inicio; i++) e = aplicar(e, orden[i]!.m);
  let delMes = e.prendido ? e.monto : null;
  for (; i < orden.length && orden[i]!.t <= fin; i++) {
    e = aplicar(e, orden[i]!.m);
    if (e.prendido) delMes = e.monto;
  }
  return delMes;
}

/** ¿El recurrente cuenta en el mes? Ver `montoDelCostoEn`. */
export function costoVigenteEn(c: CostoParaVigencia, periodo: string): boolean {
  return montoDelCostoEn(c, periodo) !== null;
}

/** Las líneas de egreso de los meses de Nexus, con la misma forma que las del Excel. */
export function egresosDeNexus(
  periodos: readonly string[],
  costos: readonly CostoParaEgreso[],
  gastos: readonly GastoParaEgreso[],
  calidadDe: (periodo: string) => CalidadDato,
): EgresoDeMes[] {
  const out: EgresoDeMes[] = [];
  for (const periodo of periodos.filter(egresoDesdeNexus)) {
    for (const c of costos) {
      const monto = montoDelCostoEn(c, periodo);
      if (monto === null) continue;
      out.push({
        periodo,
        rubro: c.categoria,
        concepto: c.nombre,
        conceptoClave: `costo-${c.id}`,
        monto: round2(montoMensual(monto, c.frecuencia)),
        moneda: c.moneda,
        calidad: calidadDe(periodo),
      });
    }
    const porMoneda = new Map<MonedaEq, number>();
    for (const g of gastos) {
      if (g.fecha.slice(0, 7) !== periodo) continue;
      porMoneda.set(g.moneda, round2((porMoneda.get(g.moneda) ?? 0) + g.monto));
    }
    for (const [moneda, monto] of porMoneda) {
      out.push({
        periodo,
        rubro: "FIJO_OPERACION",
        concepto: "Gastos del mes",
        conceptoClave: "gastos-del-mes",
        monto,
        moneda,
        calidad: calidadDe(periodo),
      });
    }
  }
  return out;
}

/**
 * La calidad de un mes de Nexus: completo con las dos quincenas de planilla y los gastos del mes confirmados. Los
 * faltantes de planilla se nombran igual que los del Excel («planilla», «planilla-q2») para que el cierre los reconozca.
 */
export function calidadDeMesDeNexus(quincenas: ReadonlySet<number>, gastosConfirmados: boolean): { estado: EstadoMes; faltantes: string[] } {
  const faltantes: string[] = [];
  if (quincenas.size === 0) faltantes.push("planilla");
  else for (const q of [1, 2]) if (!quincenas.has(q)) faltantes.push(`planilla-q${q}`);
  if (!gastosConfirmados) faltantes.push("gastos del mes sin confirmar");
  return { estado: faltantes.length === 0 ? "COMPLETO" : "PARCIAL", faltantes };
}
