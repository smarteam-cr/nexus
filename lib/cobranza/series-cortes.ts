/**
 * lib/cobranza/series-cortes.ts — QUÉ CORTES DE CARTERA SE PUEDEN COMPARAR ENTRE SÍ.
 *
 * Cada corte (SnapshotCartera) guarda una foto con su ventana: desde el corte anterior hasta hoy, y
 * lo que se proyectó cobrar hasta el próximo. Reportes dibuja esas fotos en línea, y el reporte con
 * IA las narra.
 *
 * Dos cosas hacían mentir a esas líneas (2026-09-12):
 *   · la ventana arrancaba en la fecha UTC del corte anterior —un corte a las 21:49 CR ya es el día
 *     siguiente en UTC— y lo proyectado llegaba a +7 días con cortes cada quince;
 *   · «Cobrado vs proyectado» comparaba la proyección del corte anterior con el cobrado de este
 *     aunque no se correspondieran: si faltó un corte en el medio, o si el anterior se calculó con
 *     otro criterio.
 *
 * PURO: sin Prisma ni red. Lo usan el corte (`digest.ts`), el reporte con IA y `ReportesPanel`.
 */
import { crDateParts } from "@/lib/jobs/time";
import type { MetricasCartera } from "./engine";

type Moneda = "CRC" | "USD";

export interface CorteDeLaSerie {
  capturedAt: string;
  metricas: MetricasCartera;
}

const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** El `hastaISO` guardado en las métricas de un corte, si lo tiene bien formado. */
function hastaGuardado(metricas: unknown): string | null {
  if (!metricas || typeof metricas !== "object" || !("ventana" in metricas)) return null;
  const ventana = metricas.ventana;
  if (!ventana || typeof ventana !== "object" || !("hastaISO" in ventana)) return null;
  const hasta = ventana.hastaISO;
  return typeof hasta === "string" && ES_DIA.test(hasta) ? hasta : null;
}

/**
 * Desde qué día (exclusivo) cuenta «lo cobrado desde el último corte»: el `hastaISO` del corte
 * anterior, que es el día de Costa Rica en que se hizo. Un corte sin métricas cae al día de Costa
 * Rica de su `capturedAt`. `null` = no hay corte anterior: el primero no tiene ventana.
 *
 * ⚠ Nunca `capturedAt.toISOString().slice(0, 10)`: ese es el día UTC, y con un corte guardado a
 * las 21:49 CR la ventana siguiente arrancaba un día tarde y perdía lo cobrado ese día.
 */
export function inicioDeVentanaISO(anterior: { capturedAt: Date | string; metricas: unknown } | null): string | null {
  if (!anterior) return null;
  const hasta = hastaGuardado(anterior.metricas);
  if (hasta) return hasta;
  const capturado = typeof anterior.capturedAt === "string" ? new Date(anterior.capturedAt) : anterior.capturedAt;
  return crDateParts(capturado).dateKey;
}

/**
 * ¿`actual` es el corte al que apuntaba `anterior`? Mismo criterio (`version`), la proyección de
 * `anterior` termina justo el día de `actual`, y la ventana de `actual` arranca donde terminó
 * `anterior`. Solo entonces «lo que se proyectó» y «lo que entró» miden la misma quincena.
 */
export function correspondeAlAnterior(anterior: CorteDeLaSerie, actual: CorteDeLaSerie): boolean {
  const a = anterior.metricas;
  const b = actual.metricas;
  return a.version === b.version && a.ventana.proximoCorteISO === b.ventana.hastaISO && b.ventana.desdeISO === a.ventana.hastaISO;
}

/**
 * Los cortes calculados con el MISMO criterio que el último, en su orden. Vencido, aging y DSO se
 * dibujan solo con estos: un cambio de criterio mueve la línea sin que la cartera se mueva (el
 * vencido del criterio viejo leía $19.962 más alto sobre la misma cartera del 2026-07-24).
 *
 * ⚠ Para estas tres basta el criterio: son fotos de un día, y no dependen de que el corte anterior
 * apuntara a este. «Cobrado vs proyectado» sí mide una ventana, y exige además la correspondencia.
 */
export function cortesComparables<T extends CorteDeLaSerie>(series: readonly T[]): T[] {
  if (series.length === 0) return [];
  const version = series[series.length - 1]?.metricas.version;
  return series.filter((s) => s.metricas.version === version);
}

/**
 * «Cobrado vs proyectado», alineado a `series`: en cada corte, lo cobrado en su ventana y lo que el
 * corte anterior proyectó para esa misma ventana. `null` —hueco, nunca cero— cuando el corte no se
 * corresponde con el anterior: el primero, el que sigue a un corte que falta, o uno con otro criterio.
 * CRC y USD por separado, siempre.
 */
export function serieCobradoVsProyectado(
  series: readonly CorteDeLaSerie[],
  moneda: Moneda,
): { cobrado: (number | null)[]; proyectado: (number | null)[] } {
  const cobrado: (number | null)[] = [];
  const proyectado: (number | null)[] = [];
  series.forEach((actual, i) => {
    const anterior = i > 0 ? series[i - 1] : undefined;
    if (anterior && correspondeAlAnterior(anterior, actual)) {
      cobrado.push(actual.metricas.moneda[moneda].totalCobradoDesdeUltimoCorte);
      proyectado.push(anterior.metricas.moneda[moneda].proyectadoProximoCorte);
    } else {
      cobrado.push(null);
      proyectado.push(null);
    }
  });
  return { cobrado, proyectado };
}
