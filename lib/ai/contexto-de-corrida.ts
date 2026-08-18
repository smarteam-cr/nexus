/**
 * lib/ai/contexto-de-corrida.ts — A QUÉ ATRIBUIR UNA LLAMADA A CLAUDE.
 *
 * El medidor vive en `lib/anthropic.ts`, que es el único punto por donde pasan las 26 llamadas del
 * sistema. Desde ahí se ve QUÉ se gastó (modelo, tokens) pero no DE QUIÉN fue: el proxy no sabe si
 * lo disparó el handoff de un cliente, el watchdog, o alguien apretando un botón.
 *
 * Pasar esa procedencia por parámetro habría obligado a tocar los 26 sitios y a que ninguno se
 * olvidara nunca. `AsyncLocalStorage` la hace viajar sola por la cadena de await.
 *
 * ── LA DECISIÓN QUE HACE QUE ESTO SIRVA DESDE EL DÍA UNO ─────────────────────
 * ⭐ Sin contexto TAMBIÉN se mide. Una llamada que nadie envolvió igual deja su fila con modelo,
 * tokens y costo — lo único que le falta es a quién cargársela. Es lo que permite medir el 100%
 * hoy y atribuir de a poco, en vez de no tener nada hasta haber cableado los 26 sitios.
 *
 * ⚠ Solo servidor: `node:async_hooks` no existe en el navegador. Ningún componente puede importar
 * este módulo (tampoco podría importar `lib/anthropic.ts`, que es su único consumidor real).
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface ContextoDeCorrida {
  /** El slug del agente (`agent-handoff-development`, `agent-timeline-detail`…). */
  agentSlug?: string | null;
  /** La fila de `AgentRun`, cuando el camino crea una. 10 de los 26 sitios no crean ninguna. */
  agentRunId?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  /**
   * Quién apretó el botón. `null`/ausente = lo disparó el sistema (watchdog, post-proceso,
   * clasificador, cron). ⭐ Esa distinción es la que decide contra qué presupuesto se cobra:
   * lo automático es lo que puede dispararse solo y hay que frenar con vara corta.
   */
  triggeredByEmail?: string | null;
  /** Etiqueta libre del sitio que llama, para los caminos sin agente ni corrida. */
  origen?: string | null;
}

const almacen = new AsyncLocalStorage<ContextoDeCorrida>();

/**
 * Corre `fn` con este contexto colgado. Todo lo que llame a Claude adentro —por más awaits que
 * haya en el medio— queda atribuido.
 *
 * Anidar es acumulativo: el contexto interno completa al externo en vez de reemplazarlo, así que
 * envolver un tramo con un dato más no pierde lo que ya se sabía.
 */
export function conContextoDeIA<T>(ctx: ContextoDeCorrida, fn: () => T): T {
  const previo = almacen.getStore();
  return almacen.run({ ...previo, ...ctx }, fn);
}

/** El contexto vigente, o `undefined` si nadie envolvió. Nunca lanza. */
export function contextoDeIA(): ContextoDeCorrida | undefined {
  return almacen.getStore();
}

/** ¿Esta llamada la disparó una persona? Sin contexto, se asume que NO — ver abajo. */
export function esDisparoHumano(ctx: ContextoDeCorrida | undefined): boolean {
  return !!ctx?.triggeredByEmail;
}

/**
 * ⛔ El default es «automático», y es a propósito.
 *
 * Si una llamada sin contexto cayera al presupuesto humano —el generoso—, cualquier camino nuevo
 * que nadie envolvió gastaría con la vara larga justamente por no estar cableado. El olvido tiene
 * que ser conservador, no permisivo: lo que no se sabe de quién es, se cobra al presupuesto que
 * frena.
 */
export type ClaseDeGasto = "humano" | "automatico";

export function claseDeGasto(ctx: ContextoDeCorrida | undefined): ClaseDeGasto {
  return esDisparoHumano(ctx) ? "humano" : "automatico";
}
