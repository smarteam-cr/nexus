/**
 * lib/invariantes/job.ts — lo que corre el job `invariants-daily` (B-08, 2026-09-04).
 *
 * Corre los invariantes solo-base contra la base de producción una vez al día y, si alguno está
 * en rojo, LANZA. No es un descuido: el scheduler ya sabe qué hacer con un job que lanza — anota
 * `{ok:false, error}` en `CronJobState.lastResult` (el semáforo de Integraciones lo pinta rojo,
 * B-03) y lo manda a Sentry con `tags.job` (B-02). Un invariante violado ES un fallo del sistema;
 * devolver «ok» con un log sería exactamente el silencio que B-02 vino a matar.
 *
 * Solo lecturas. Los invariantes que necesitan HubSpot, el sistema de archivos o el schema siguen
 * en `scripts/check-invariants.ts`, que se corre a mano.
 */
import type { PrismaClient } from "@prisma/client";
import { correrInvariantesSoloBase, type CorridaDeInvariantes } from "./index";

export const JOB_INVARIANTES = "invariants-daily";

/** Tope del texto que viaja a `lastResult.error` y a Sentry: el detalle completo está en el gate manual. */
export const TOPE_DEL_MENSAJE = 600;

export class InvariantesVioladosError extends Error {
  readonly violados: string[];
  constructor(violados: string[], mensaje: string) {
    super(mensaje);
    this.name = "InvariantesViolados";
    this.violados = violados;
  }
}

/** Qué se violó y la primera línea de cada uno, acotado. Puro. */
export function mensajeDeViolaciones(corrida: CorridaDeInvariantes, tope = TOPE_DEL_MENSAJE): string {
  const malos = corrida.resultados.filter((r) => !r.ok);
  const cabecera = `${malos.length} invariante(s) en rojo: ${malos.map((r) => `INV${r.id}`).join(", ")}`;
  const detalle = malos.map((r) => (r.lineas[0] ?? "").split("\n")[0]).join(" · ");
  const texto = `${cabecera} — ${detalle}`;
  return texto.length > tope ? `${texto.slice(0, tope - 1)}…` : texto;
}

/**
 * Corre todos los solo-base. En verde devuelve el resumen para el log; en rojo lanza
 * `InvariantesVioladosError` con los ids y el mensaje acotado.
 */
export async function correrJobDeInvariantes(db: PrismaClient, ahora: Date): Promise<string> {
  const corrida = await correrInvariantesSoloBase(db, ahora);
  if (!corrida.ok) {
    const violados = corrida.resultados.filter((r) => !r.ok).map((r) => r.id);
    throw new InvariantesVioladosError(violados, mensajeDeViolaciones(corrida));
  }
  return `${corrida.resultados.length} invariantes solo-base en verde`;
}
