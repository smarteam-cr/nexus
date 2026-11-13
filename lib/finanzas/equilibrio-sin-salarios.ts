/**
 * lib/finanzas/equilibrio-sin-salarios.ts — el reporte de equilibrio para quien NO ve salarios (2026-11-13). PURO.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────
 * El punto de equilibrio lo abre también quien tiene «Caja y pagos» (`tesoreria`, María José), que no es el permiso de
 * la planilla. El reporte ya trae la planilla SUMADA por mes, pero dos listas de diagnóstico viajaban con nombre y
 * monto, costo por costo: lo que no se pudo convertir por falta de tipo de cambio (`pisoVigente.noConvertidos` y
 * `fx.montosNoConvertidos`). En un año sin tasa —2020, por ejemplo— eso era el salario de cada persona con su nombre
 * (revisión del 13 de noviembre). Los avisos de calidad, además, nombran conceptos del libro de egresos (los pagos de
 * aguinaldo, por ejemplo), que pueden ser personas.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────────
 * Para quien no ve salarios, lo que viaja al navegador no trae el nombre de ningún costo ni el monto de un salario:
 *   · lo sin convertir va SUMADO por rubro y moneda (y por mes, en el de los egresos), con el nombre del rubro;
 *   · lo de los rubros de salario (planilla y reserva de aguinaldo) sin convertir no viaja: una suma de planilla en una
 *     moneda puede ser de una sola persona. El aviso de los meses sin tipo de cambio sigue diciendo cuáles son;
 *   · los avisos de calidad viajan sin la lista de conceptos.
 * Nada de esto cambia un total: lo sin convertir ya está FUERA de los totales.
 */
import type { ReporteEquilibrio, RubroEgreso } from "./equilibrio";
import { etiquetaRubro } from "./equilibrio";

/** Los rubros que son plata de personas: su monto sin convertir no viaja a quien no ve salarios. */
export const RUBROS_DE_SALARIO: ReadonlySet<RubroEgreso> = new Set<RubroEgreso>(["PLANILLA", "RESERVA_AGUINALDO"]);

const round2 = (n: number) => Math.round(n * 100) / 100;
const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function sumarPor<T, K extends string>(filas: readonly T[], clave: (f: T) => K, monto: (f: T) => number): Map<K, { primera: T; monto: number }> {
  const out = new Map<K, { primera: T; monto: number }>();
  for (const f of filas) {
    const k = clave(f);
    const g = out.get(k);
    if (g) g.monto = round2(g.monto + monto(f));
    else out.set(k, { primera: f, monto: round2(monto(f)) });
  }
  return out;
}

export function sinSalariosPorPersona<R extends Pick<ReporteEquilibrio, "pisoVigente" | "fx" | "calidad">>(r: R): R {
  const piso = r.pisoVigente
    ? {
        ...r.pisoVigente,
        noConvertidos: [
          ...sumarPor(
            r.pisoVigente.noConvertidos.filter((n) => !RUBROS_DE_SALARIO.has(n.rubro)),
            (n) => `${n.rubro}|${n.moneda}`,
            (n) => n.monto,
          ).values(),
        ].map(({ primera, monto }) => ({ concepto: conMayuscula(etiquetaRubro(primera.rubro)), moneda: primera.moneda, monto, rubro: primera.rubro })),
      }
    : r.pisoVigente;

  // Los ingresos sin convertir (sin rubro) no nombran personas: «venta ganada», el tipo de servicio, «comisión de aliado».
  const ingresos = r.fx.montosNoConvertidos.filter((n) => !n.rubro);
  const egresos = sumarPor(
    r.fx.montosNoConvertidos.filter((n): n is typeof n & { rubro: RubroEgreso } => !!n.rubro && !RUBROS_DE_SALARIO.has(n.rubro)),
    (n) => `${n.periodo}|${n.rubro}|${n.moneda}`,
    (n) => n.monto,
  );

  return {
    ...r,
    pisoVigente: piso,
    fx: {
      ...r.fx,
      montosNoConvertidos: [
        ...ingresos,
        ...[...egresos.values()].map(({ primera, monto }) => ({
          periodo: primera.periodo,
          moneda: primera.moneda,
          monto,
          concepto: conMayuscula(etiquetaRubro(primera.rubro)),
          rubro: primera.rubro,
        })),
      ],
    },
    calidad: { ...r.calidad, avisos: r.calidad.avisos.map((a) => ({ ...a, conceptos: [] })) },
  };
}
