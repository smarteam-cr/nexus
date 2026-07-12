/**
 * lib/cobranza/__fixtures__/proyeccion-golden-input.ts
 *
 * INPUT del golden de `proyectarIngresos` (test G1 en engine.test.ts). Fuente
 * ÚNICA compartida por el generador one-off y el test: un set determinista de
 * cobros que cubre TODAS las ramas del motor (vencidos, gracia, bordes de
 * quincena 15/16, febrero clampeado, fuera de horizonte, COBRADO excluido,
 * CRC y USD, empates de fecha para el tie-break por id) × combinaciones de
 * opts (incluido el clamp mesesEnQuincenas > horizonteMeses).
 *
 * ⚠ NO editar estas fixtures ni el JSON generado a la ligera: el golden existe
 * para probar que un refactor NO mueve los números de ingresos (están en
 * producción). Si un cambio de COMPORTAMIENTO deliberado los mueve, se
 * regenera el JSON en el mismo commit que documenta el porqué.
 */
import type { CobroProyeccionInput } from "../engine";

const c = (
  cobroId: string,
  fechaProgramadaISO: string,
  monto: number,
  moneda: "CRC" | "USD",
  estado = "POR_COBRAR",
): CobroProyeccionInput => ({
  cobroId,
  cuentaId: `cta-${cobroId}`,
  clienteNombre: `Cliente ${cobroId.toUpperCase()}`,
  estado,
  fechaProgramadaISO,
  monto,
  moneda,
});

export const GOLDEN_COBROS: CobroProyeccionInput[] = [
  // Muy vencidos (siempre "en riesgo" para los todayISO del set)
  c("aa", "2026-04-01", 250_000, "CRC"),
  c("ab", "2026-05-10", 1_200, "USD"),
  c("ac", "2026-06-15", 333.33, "CRC", "PROGRAMADO"),
  // Alrededor del umbral para 2026-07-10 (vencido 4d / gracia 3-1d / hoy)
  c("ad", "2026-07-01", 500, "USD"),
  c("ae", "2026-07-06", 150.5, "USD"),
  c("af", "2026-07-07", 99.99, "CRC"),
  c("ag", "2026-07-08", 80_000, "CRC", "PROGRAMADO"),
  c("ah", "2026-07-09", 45, "USD", "SIN_DATO"),
  c("ai", "2026-07-10", 1_000_000, "CRC"),
  // Bordes de quincena julio
  c("aj", "2026-07-15", 750, "USD"),
  c("ak", "2026-07-16", 320_000, "CRC"),
  c("al", "2026-07-31", 0.01, "USD"),
  // Empate de fecha (tie-break por cobroId) con monedas distintas
  c("an", "2026-07-20", 200, "USD"),
  c("am", "2026-07-20", 60_000, "CRC"),
  // Agosto (quincenas con defaults)
  c("ao", "2026-08-01", 425.75, "USD", "PROGRAMADO"),
  c("ap", "2026-08-15", 90_000, "CRC"),
  c("aq", "2026-08-16", 1_500, "USD"),
  c("ar", "2026-08-31", 12_345.67, "CRC"),
  // Meses del horizonte (buckets mensuales con defaults)
  c("as", "2026-09-05", 800, "USD"),
  c("at", "2026-09-30", 275_000, "CRC", "PROGRAMADO"),
  c("au", "2026-10-10", 65, "USD"),
  c("av", "2026-11-11", 111_111.11, "CRC"),
  c("aw", "2026-12-15", 999.99, "USD"),
  c("ax", "2026-12-31", 40_000, "CRC"),
  // Más allá del horizonte default desde julio
  c("ay", "2027-01-01", 5_000, "USD"),
  c("az", "2027-02-15", 700_000, "CRC"),
  c("ba", "2027-06-30", 88, "USD"),
  // COBRADOS (el motor los excluye siempre)
  c("bb", "2026-07-05", 123_456, "CRC", "COBRADO"),
  c("bc", "2026-08-10", 999, "USD", "COBRADO"),
  // Febrero (clamp 16–28 con todayISO 2026-02-10; 2026 NO es bisiesto)
  c("bd", "2026-02-14", 55_000, "CRC"),
  c("be", "2026-02-15", 15, "USD"),
  c("bf", "2026-02-16", 30_000, "CRC", "PROGRAMADO"),
  c("bg", "2026-02-28", 44.44, "USD"),
  c("bh", "2026-03-01", 77_000, "CRC"),
  c("bi", "2026-03-16", 210, "USD"),
  // Pasado remoto y montos chicos extra (ruido determinista)
  c("bj", "2025-12-01", 9.99, "USD"),
  c("bk", "2026-01-15", 500_000, "CRC", "PROGRAMADO"),
];

export interface GoldenCase {
  nombre: string;
  todayISO: string;
  opts: {
    horizonteMeses?: number;
    mesesEnQuincenas?: number;
    umbralVencidoDias?: number;
  };
}

export const GOLDEN_CASES: GoldenCase[] = [
  { nombre: "defaults-jul10", todayISO: "2026-07-10", opts: {} },
  { nombre: "defaults-jul20-q1-skip", todayISO: "2026-07-20", opts: {} },
  { nombre: "febrero-clamp", todayISO: "2026-02-10", opts: {} },
  { nombre: "horizonte-3", todayISO: "2026-07-10", opts: { horizonteMeses: 3 } },
  { nombre: "sin-quincenas", todayISO: "2026-07-10", opts: { mesesEnQuincenas: 0 } },
  { nombre: "quincenas-4", todayISO: "2026-07-10", opts: { mesesEnQuincenas: 4 } },
  { nombre: "umbral-7", todayISO: "2026-07-10", opts: { umbralVencidoDias: 7 } },
  // El clamp: mesesEnQuincenas > horizonteMeses (la rama que el refactor muda de lugar)
  { nombre: "clamp-quincenas", todayISO: "2026-07-10", opts: { horizonteMeses: 2, mesesEnQuincenas: 6 } },
];
