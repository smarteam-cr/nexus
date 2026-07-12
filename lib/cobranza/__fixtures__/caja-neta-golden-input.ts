/**
 * Fixtures CONGELADAS para el golden G2 de computeCajaNeta (fase 4.5).
 *
 * Escenario rico y determinista que ejercita las 3 patas juntas: ingresos
 * (entra), costos recurrentes CON finalizadoEl (sale fijo) y gastos puntuales
 * pasado/hoy/futuro/fuera-de-horizonte (sale variable). El JSON hermano
 * (caja-neta-golden.json) se generó con el engine y NO se regenera para
 * "arreglar" el test: si G2 se pone rojo, un número de la caja neta se movió.
 *
 * ⚠ No editar a la ligera — cambia el golden.
 */
import type {
  CobroProyeccionInput,
  CostoProyeccionInput,
  GastoProyeccionInput,
} from "../engine";

/** todayISO fijo del caso: 2026-07-10 (día ≤ 15 → la Q1 de julio SÍ se emite). */
export const G2_TODAY = "2026-07-10";
export const G2_OPTS = { todayISO: G2_TODAY };

export const G2_COBROS: CobroProyeccionInput[] = [
  // Entra en la quincena en curso (dentro de gracia) y meses siguientes.
  { cobroId: "i1", cuentaId: "c1", clienteNombre: "A", estado: "POR_COBRAR", fechaProgramadaISO: "2026-07-12", monto: 500000, moneda: "CRC" },
  { cobroId: "i2", cuentaId: "c1", clienteNombre: "A", estado: "PROGRAMADO", fechaProgramadaISO: "2026-07-28", monto: 300, moneda: "USD" },
  { cobroId: "i3", cuentaId: "c2", clienteNombre: "B", estado: "PROGRAMADO", fechaProgramadaISO: "2026-08-20", monto: 800000, moneda: "CRC" },
  { cobroId: "i4", cuentaId: "c2", clienteNombre: "B", estado: "PROGRAMADO", fechaProgramadaISO: "2026-09-05", monto: 1200, moneda: "USD" },
  { cobroId: "i5", cuentaId: "c3", clienteNombre: "C", estado: "COBRADO", fechaProgramadaISO: "2026-07-01", monto: 999, moneda: "USD" }, // excluido (ya entró)
];

export const G2_COSTOS: CostoProyeccionInput[] = [
  // Vigente indefinido.
  { costoId: "s1", nombre: "Salario", categoria: "SALARIO", monto: 900000, moneda: "CRC", frecuencia: "MENSUAL", activo: true },
  // Herramienta ANUAL → mensualiza a 100/mes.
  { costoId: "h1", nombre: "Tool", categoria: "HERRAMIENTA", monto: 1200, moneda: "USD", frecuencia: "ANUAL", activo: true },
  // Baja definitiva el 20 de agosto → entra jul + ago (ambas quincenas), no sep+.
  { costoId: "s2", nombre: "Saliente", categoria: "SALARIO", monto: 600000, moneda: "CRC", frecuencia: "MENSUAL", activo: true, finalizadoEl: "2026-08-20" },
  // Baja YA pasada (antes de hoy) → fuera de todo bucket y del burn.
  { costoId: "s3", nombre: "Ex", categoria: "SALARIO", monto: 400000, moneda: "CRC", frecuencia: "MENSUAL", activo: true, finalizadoEl: "2026-06-30" },
];

export const G2_GASTOS: GastoProyeccionInput[] = [
  { gastoId: "g1", nombre: "Pasado", monto: 50000, moneda: "CRC", fechaISO: "2026-07-01" }, // pasado → no bucketiza
  { gastoId: "g2", nombre: "Hoy", monto: 30000, moneda: "CRC", fechaISO: "2026-07-10" }, // hoy → primer bucket
  { gastoId: "g3", nombre: "Futuro Q2", monto: 90000, moneda: "CRC", fechaISO: "2026-07-25" }, // Q2 julio
  { gastoId: "g4", nombre: "Futuro USD", monto: 450, moneda: "USD", fechaISO: "2026-08-10" }, // ago Q1
  { gastoId: "g5", nombre: "Lejano", monto: 777, moneda: "USD", fechaISO: "2027-06-01" }, // fuera de horizonte
];
