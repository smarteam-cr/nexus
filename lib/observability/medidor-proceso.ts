/**
 * lib/observability/medidor-proceso.ts — memoria y atraso del hilo de JS, medidos desde adentro.
 *
 * Incidente 2026-09-21: producción quemó 821 % de CPU con 1,13 GiB y dejó de atender; venía
 * congelándose 15–25 s desde horas antes. Nadie lo vio venir porque ni `/api/health` ni los logs
 * decían cuánta memoria usaba el proceso ni cuánto se atrasaba el hilo de JS. Esto lo mide:
 *   - `/api/health` devuelve rss, heapUsed y el tope del heap (MB) y el atraso del hilo (p50, p99
 *     y máximo de la última ventana de 10 s). Solo números: el endpoint es público.
 *   - una línea de aviso en consola, con fecha, cuando el atraso pasa de 2 s o el heap del 80 % del
 *     tope; como mucho una por minuto. Así `docker logs` dice CUÁNDO empezó a degradarse.
 *
 * ⚠ Una sola instancia por PROCESO: Next arma bundles separados para instrumentation.ts y para las
 * rutas, y cada uno tendría su copia del módulo. Por eso el estado vive en `globalThis`.
 * ⚠ Si el hilo queda trabado del todo, el aviso sale recién cuando se destraba (con el atraso que
 * tuvo): el timer que lo escribe corre en el mismo hilo. Un proceso que no vuelve no deja línea.
 */
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import { getHeapStatistics } from "node:v8";

/** Cada cuánto se cierra una ventana del histograma y se evalúa el aviso. */
export const VENTANA_MS = 10_000;
/** Umbrales del aviso y cada cuánto, como mucho, se escribe. */
export const UMBRAL_ATRASO_MS = 2_000;
export const UMBRAL_HEAP = 0.8;
export const AVISO_CADA_MS = 60_000;

export interface LecturaDelProceso {
  rssMb: number;
  heapUsedMb: number;
  heapLimitMb: number;
  /** Atraso del hilo de JS en la última ventana cerrada (ms). */
  atrasoMs: { p50: number; p99: number; max: number };
}

// ── Puras ───────────────────────────────────────────────────────────────────

export function aMb(bytes: number): number {
  return Math.round(bytes / 1_048_576);
}

/** El histograma mide en nanosegundos; vacío puede devolver NaN o valores basura: se lee como 0. */
export function nsAMs(ns: number): number {
  return Number.isFinite(ns) && ns > 0 ? Math.round(ns / 1_000_000) : 0;
}

/** Por qué avisar, en palabras (vacío = todo bien). */
export function motivosDeAviso(
  l: LecturaDelProceso,
  umbrales: { atrasoMs: number; heap: number } = { atrasoMs: UMBRAL_ATRASO_MS, heap: UMBRAL_HEAP },
): string[] {
  const motivos: string[] = [];
  if (l.atrasoMs.max > umbrales.atrasoMs) motivos.push(`hilo atrasado ${l.atrasoMs.max} ms`);
  if (l.heapLimitMb > 0 && l.heapUsedMb / l.heapLimitMb > umbrales.heap) {
    motivos.push(`heap al ${Math.round((100 * l.heapUsedMb) / l.heapLimitMb)} % del tope`);
  }
  return motivos;
}

/** ¿Pasó el intervalo mínimo desde el último aviso? */
export function tocaAvisar(ahoraMs: number, ultimoAvisoMs: number | null, cadaMs: number = AVISO_CADA_MS): boolean {
  return ultimoAvisoMs === null || ahoraMs - ultimoAvisoMs >= cadaMs;
}

/** UNA línea, con fecha, grepeable por `[medidor]`. */
export function lineaDeAviso(fecha: Date, l: LecturaDelProceso, motivos: string[]): string {
  return (
    `[medidor] ${fecha.toISOString()} ⚠ ${motivos.join(" · ")} — ` +
    `atraso p50 ${l.atrasoMs.p50} ms, p99 ${l.atrasoMs.p99} ms, máx ${l.atrasoMs.max} ms · ` +
    `heap ${l.heapUsedMb}/${l.heapLimitMb} MB · rss ${l.rssMb} MB`
  );
}

// ── El medidor del proceso ──────────────────────────────────────────────────

interface EstadoDelMedidor {
  histograma: IntervalHistogram;
  /** Atraso de la última ventana cerrada (null hasta que cierra la primera). */
  ultimaVentana: LecturaDelProceso["atrasoMs"] | null;
  ultimoAviso: number | null;
}

declare global {
  // `var` es la única forma de declarar una propiedad de globalThis en TypeScript.
  var __nexusMedidorDeProceso: EstadoDelMedidor | undefined;
}

/** Cada cuánto muestrea el histograma (ms). */
const RESOLUCION_MS = 20;

/* El histograma anota el tiempo ENTRE dos disparos de su timer, así que un hilo ocioso marca la
   resolución (20 ms), no 0. Se resta para que el número sea el atraso y nada más. */
function atrasoDe(h: IntervalHistogram): LecturaDelProceso["atrasoMs"] {
  const atraso = (ns: number) => Math.max(0, nsAMs(ns) - RESOLUCION_MS);
  return { p50: atraso(h.percentile(50)), p99: atraso(h.percentile(99)), max: atraso(h.max) };
}

function memoria(): Omit<LecturaDelProceso, "atrasoMs"> {
  const m = process.memoryUsage();
  return { rssMb: aMb(m.rss), heapUsedMb: aMb(m.heapUsed), heapLimitMb: aMb(getHeapStatistics().heap_size_limit) };
}

function cerrarVentana(estado: EstadoDelMedidor): void {
  const lectura: LecturaDelProceso = { ...memoria(), atrasoMs: atrasoDe(estado.histograma) };
  estado.ultimaVentana = lectura.atrasoMs;
  estado.histograma.reset();
  const motivos = motivosDeAviso(lectura);
  const ahora = Date.now();
  if (motivos.length > 0 && tocaAvisar(ahora, estado.ultimoAviso)) {
    estado.ultimoAviso = ahora;
    console.warn(lineaDeAviso(new Date(ahora), lectura, motivos));
  }
}

/** Arranca el medidor UNA vez por proceso (las llamadas siguientes no hacen nada). */
export function iniciarMedidor(): EstadoDelMedidor {
  const existente = globalThis.__nexusMedidorDeProceso;
  if (existente) return existente;
  const histograma = monitorEventLoopDelay({ resolution: RESOLUCION_MS });
  histograma.enable();
  const estado: EstadoDelMedidor = { histograma, ultimaVentana: null, ultimoAviso: null };
  globalThis.__nexusMedidorDeProceso = estado;
  // unref: el medidor nunca mantiene vivo al proceso.
  setInterval(() => cerrarVentana(estado), VENTANA_MS).unref();
  return estado;
}

/** Memoria de ahora y atraso de la última ventana cerrada (o de la que está en curso, al arrancar). */
export function leerProceso(): LecturaDelProceso {
  const estado = iniciarMedidor();
  return { ...memoria(), atrasoMs: estado.ultimaVentana ?? atrasoDe(estado.histograma) };
}
