/**
 * lib/jobs/contexto.ts — ¿esto corre dentro de un job del scheduler?
 *
 * Lo pregunta el transporte de HubSpot (lib/hubspot/client.ts) para elegir cuánto puede esperar ante un 429: en un job,
 * lo que diga `Retry-After`; en una ruta del usuario, 2 s como máximo (ARCHITECTURE §7, regla 2). Pasarlo por parámetro
 * habría obligado a tocar cada llamador de HubSpot; `AsyncLocalStorage` lo hace viajar solo por la cadena de await,
 * como `lib/ai/contexto-de-corrida.ts`.
 *
 * ⚠ Solo servidor: `node:async_hooks` no existe en el navegador.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const almacen = new AsyncLocalStorage<{ job: string }>();

/** Corre `fn` como parte del job `job`: todo lo que llame adentro, por más awaits que haya, lo sabe. */
export function enUnJob<T>(job: string, fn: () => T): T {
  return almacen.run({ job }, fn);
}

/** La clave del job que está corriendo, o null si esto no lo disparó el scheduler. Nunca lanza. */
export function jobEnCurso(): string | null {
  return almacen.getStore()?.job ?? null;
}
