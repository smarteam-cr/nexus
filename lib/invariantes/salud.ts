/**
 * lib/invariantes/salud.ts — el único dato de invariantes que cruza a `/api/health` (B-09).
 *
 * `/api/health` es PÚBLICO (lo consume deploy.sh sin sesión y el healthcheck del compose), así
 * que de los invariantes expone UN booleano y nada más: ni cuáles, ni cuántos, ni el texto —
 * eso vive en el semáforo de Integraciones (con sesión) y en el gate manual.
 *
 *   true   la última corrida del job `invariants-daily` (B-08) dio todo en verde
 *   false  la última corrida encontró al menos uno en rojo
 *   null   el job todavía no corrió desde que existe el registro, o no se pudo leer
 *
 * ⚠ `null` NO es `false` a propósito: en un deploy recién hecho el job no corrió, y decir «los
 * invariantes están rotos» sería mentir. Y NUNCA participa del `ok` del health: un invariante
 * violado es un dato mal escrito, no un contenedor caído — si tumbara el healthcheck, Docker
 * reiniciaría la app en bucle por una fila de cobranza.
 */
import { JOB_INVARIANTES } from "./job";
import { leerEstadoDeJobs, type EstadoDeJob } from "@/lib/jobs/estado";

/** Puro: del estado del job al booleano público. */
export function invariantesOkDesde(estado: EstadoDeJob | undefined): boolean | null {
  const r = estado?.resultado;
  if (!r) return null;
  return r.ok;
}

/** Lee el estado del job; si la lectura falla devuelve null — el health nunca cae por esto. */
export async function leerInvariantesOk(
  leer: (keys: string[]) => Promise<EstadoDeJob[]> = leerEstadoDeJobs,
): Promise<boolean | null> {
  try {
    const [estado] = await leer([JOB_INVARIANTES]);
    return invariantesOkDesde(estado);
  } catch {
    return null;
  }
}
