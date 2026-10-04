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
 * PURO: sin Prisma ni red.
 */
import type { CalidadDato, EgresoDeMes, EstadoMes, MonedaEq } from "./equilibrio";
import { EGRESOS_DESDE_NEXUS, montoMensual, type CategoriaSinSalario } from "./gastos";

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
  /** YYYY-MM-DD: el día en que se cargó en Nexus. */
  creadoEl: string;
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

/**
 * ¿El recurrente cuenta en el mes? Que esté activo (uno pausado no se paga), que ya existiera en Nexus ese mes y que su
 * baja no sea de antes. La baja cuenta su mes entero, como en la caja neta.
 */
export function costoVigenteEn(c: Pick<CostoParaEgreso, "activo" | "finalizadoEl" | "creadoEl">, periodo: string): boolean {
  if (!c.activo) return false;
  if (c.creadoEl.slice(0, 7) > periodo) return false;
  return !(c.finalizadoEl && c.finalizadoEl.slice(0, 7) < periodo);
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
      if (!costoVigenteEn(c, periodo)) continue;
      out.push({
        periodo,
        rubro: c.categoria,
        concepto: c.nombre,
        conceptoClave: `costo-${c.id}`,
        monto: round2(montoMensual(c.monto, c.frecuencia)),
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
