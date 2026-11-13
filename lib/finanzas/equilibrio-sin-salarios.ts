/**
 * lib/finanzas/equilibrio-sin-salarios.ts — el reporte de equilibrio para quien NO ve salarios (2026-11-13). PURO.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────
 * El punto de equilibrio lo abre también quien tiene «Caja y pagos» (`tesoreria`, María José), que no es el permiso de
 * la planilla. El reporte ya trae la planilla SUMADA por mes, pero varias piezas viajaban con nombres o montos de una
 * persona (revisiones del 13 de noviembre):
 *   · lo que no se pudo convertir por falta de tipo de cambio (`pisoVigente.noConvertidos`, `fx.montosNoConvertidos`),
 *     costo por costo, con nombre y monto: en un año sin tasa, el salario de cada persona;
 *   · los conceptos del libro de egresos que FALTAN en un mes (`meses[].faltantes`, el motivo de los meses fuera del
 *     cálculo, la línea «gasto incompleto» de lo que no cuadra): alguien que entra o sale a mitad de año aparece como
 *     «salario marco pérez» en los meses en que no está;
 *   · los avisos de calidad, que nombran conceptos (los pagos de aguinaldo, por ejemplo);
 *   · la huella de cada mes (lo anotado por moneda original), que nadie lee en la pantalla y de la que se puede restar la
 *     planilla en una moneda.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────────
 * Para quien no ve salarios, lo que viaja al navegador no trae el nombre de ningún concepto de planilla o aguinaldo ni
 * el monto de un salario:
 *   · lo sin convertir va SUMADO por rubro y moneda (y por mes, en el de los egresos), con el nombre del rubro; lo de
 *     planilla y aguinaldo sin convertir no viaja (una suma de planilla en una moneda puede ser de una persona);
 *   · todo texto que nombra un faltante de planilla o aguinaldo lo dice como «planilla» (`faltantesDeSalario`, que arma
 *     el motor con la misma función que los faltantes, dice cuáles son);
 *   · los avisos viajan sin su lista de conceptos y la huella viaja vacía.
 * Nada de esto cambia un total: lo sin convertir ya está FUERA de los totales, y los faltantes son texto.
 */
import { RUBROS_DE_SALARIO, etiquetaRubro, type ReporteEquilibrio, type RubroEgreso } from "./equilibrio";
import type { Inconsistencia } from "./inconsistencias";

export { RUBROS_DE_SALARIO };

/** Cómo se lee un faltante de salario para quien no ve salarios. */
export const FALTANTE_DE_SALARIO = "planilla";

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

type Base = Pick<ReporteEquilibrio, "pisoVigente" | "fx" | "calidad" | "meses" | "equilibrio" | "faltantesDeSalario">;
/** Lo que el reporte anual (`ReporteAnualDTO`) suma encima del motor y también se tapa. */
type Extras = { inconsistencias?: Inconsistencia[]; huellas?: Record<string, unknown> };

export function sinSalariosPorPersona<R extends Base & Extras>(r: R): R {
  // ── Los textos que nombran un faltante de salario ──
  // El nombre del rubro entero («planilla», «reserva de aguinaldo») no es de nadie: se deja como está.
  const genericos = new Set([...RUBROS_DE_SALARIO].map(etiquetaRubro));
  const deSalario = new Set(Object.values(r.faltantesDeSalario ?? {}).flat().filter((t) => t && !genericos.has(t)));
  // Los más largos primero: un grupo «a, b y 2 más» se tapa entero antes que uno de sus nombres.
  const aTapar = [...deSalario].sort((a, b) => b.length - a.length);
  const taparTexto = (t: string) => aTapar.reduce((s, x) => s.split(x).join(FALTANTE_DE_SALARIO), t);
  const taparLista = (l: readonly string[]) => [...new Set(l.map((f) => (deSalario.has(f) ? FALTANTE_DE_SALARIO : taparTexto(f))))];

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

  const out: R = {
    ...r,
    pisoVigente: piso,
    meses: r.meses.map((m) => ({ ...m, faltantes: taparLista(m.faltantes) })),
    equilibrio: {
      ...r.equilibrio,
      mesesExcluidos: r.equilibrio.mesesExcluidos.map((x) => ({ ...x, motivo: taparTexto(x.motivo) })),
    },
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
    calidad: { ...r.calidad, avisos: r.calidad.avisos.map((a) => ({ ...a, mensaje: taparTexto(a.mensaje), conceptos: [] })) },
    faltantesDeSalario: {},
  };
  if (r.inconsistencias) {
    out.inconsistencias = r.inconsistencias.map((i) => ({
      ...i,
      titulo: taparTexto(i.titulo),
      detalle: taparTexto(i.detalle),
      queHacer: taparTexto(i.queHacer),
      items: i.items.map((it) => ({ ...it, texto: taparTexto(it.texto), ...(it.nota !== undefined ? { nota: taparTexto(it.nota) } : {}) })),
    }));
  }
  if (r.huellas) out.huellas = {};
  return out;
}
