/**
 * lib/finanzas/gastos.ts — los gastos del mes de Finanzas, sin salarios (rediseño 2026-10-03, docs/finanzas-rediseno-plan.md).
 *
 * Quien registra (Dinia) anota lo que sale cada mes: los gastos puntuales, los costos recurrentes que no son salarios y
 * las tarjetas. Reemplaza al Excel de egresos desde `EGRESOS_DESDE_NEXUS`: de ese mes en adelante el punto de equilibrio
 * lee estos datos; los meses anteriores se quedan con lo que ya se cargó del Excel.
 *
 * ⛔ Los salarios no entran acá en ninguna forma: ni la categoría Salario de los recurrentes ni la planilla por persona.
 * Quien registra ve solo el TOTAL de la planilla del mes.
 *
 * PURO: sin Prisma ni reloj.
 */

/** Las categorías de costo recurrente que ve y edita quien registra. Salario NO está, a propósito. */
export const CATEGORIAS_SIN_SALARIO = ["HERRAMIENTA", "FIJO_OPERACION"] as const;
export type CategoriaSinSalario = (typeof CATEGORIAS_SIN_SALARIO)[number];

export const ETIQUETA_CATEGORIA: Record<CategoriaSinSalario, string> = {
  HERRAMIENTA: "Herramientas",
  FIJO_OPERACION: "Fijos de operación",
};

export function esCategoriaSinSalario(c: string): c is CategoriaSinSalario {
  return (CATEGORIAS_SIN_SALARIO as readonly string[]).includes(c);
}

/**
 * Desde qué mes el gasto sale de Nexus y no del Excel de egresos (decisión 4 del plan: «desde octubre de 2026»). El Excel
 * se cargó por última vez el 18-ago y trae octubre a diciembre como PLANIFICADO; desde acá, manda lo que se anota.
 */
export const EGRESOS_DESDE_NEXUS = "2026-10";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-10" → "octubre". Con `conAnio`, "octubre 2026". */
export function etiquetaMes(periodo: string, conAnio = false): string {
  const [y, m] = periodo.split("-").map(Number);
  const nombre = MESES[(m ?? 1) - 1] ?? periodo;
  return conAnio ? `${nombre} ${y}` : nombre;
}

export function periodoDe(iso: string): string {
  return iso.slice(0, 7);
}

export function mesAnterior(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function mesSiguiente(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Lo que cuesta un recurrente en UN mes: un anual se reparte en doce. */
export function montoMensual(monto: number, frecuencia: string): number {
  return frecuencia === "ANUAL" ? Math.round((monto / 12) * 100) / 100 : monto;
}

/**
 * El mes cuyos gastos le toca anotar a quien registra: el anterior si todavía no avisó que están todos, si no el actual.
 * Antes de `EGRESOS_DESDE_NEXUS` no hay nada que anotar (ese gasto es del Excel). null = nada pendiente.
 */
export function gastosDelMesPendiente(p: {
  hoyISO: string;
  /** Los meses que ya se avisaron completos. */
  listos: ReadonlySet<string>;
  /** Cuántos gastos hay anotados en cada mes. */
  anotados: ReadonlyMap<string, number>;
}): { periodo: string; etiqueta: string; anotados: number; listos: boolean } | null {
  const actual = periodoDe(p.hoyISO);
  for (const periodo of [mesAnterior(actual), actual]) {
    if (periodo < EGRESOS_DESDE_NEXUS) continue;
    if (p.listos.has(periodo)) continue;
    return { periodo, etiqueta: etiquetaMes(periodo), anotados: p.anotados.get(periodo) ?? 0, listos: false };
  }
  return null;
}
