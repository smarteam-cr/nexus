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
  /**
   * La reunión cuya lectura disparó la llamada (memoria de la cuenta, etapa 2). La pone `conLaReunion` UNA vez, arriba
   * de toda la lectura, y cada sitio de adentro sigue poniendo su `origen`: el medidor guarda los dos juntos
   * (`origenDeLaFila`). Así se suma lo que cuesta cada reunión sin una columna nueva en `LlmCall`.
   */
  reunionId?: string | null;
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

/**
 * Corre `fn` atribuido a la reunión `sessionId`: toda llamada a Claude de adentro (la lectura, el clasificador, el
 * avance, la ficha, la etapa, la preventa…) queda en `LlmCall` con `origen = "reunion:<sessionId> › <sitio>"`.
 * ⚠ Hay que envolver también lo que corre DESPUÉS en segundo plano: el contexto viaja por la cadena de await que nace
 * adentro, no por una función que alguien llame afuera.
 */
export function conLaReunion<T>(sessionId: string, fn: () => T): T {
  return almacen.run({ ...almacen.getStore(), reunionId: sessionId }, fn);
}

/** El prefijo que lleva el `origen` de toda llamada que disparó la lectura de una reunión. */
export const PREFIJO_DE_LA_REUNION = "reunion:";
/** El separador entre la reunión y el sitio que llamó (el mismo que ya usa el avance: «sessions/post-process › avance»). */
export const SEPARADOR_DEL_ORIGEN = " › ";

/**
 * El `origen` que se guarda en `LlmCall`: el del sitio, o `reunion:<sessionId> › <sitio>` si la llamada la disparó la
 * lectura de una reunión (`reunion:<sessionId>` solo, si el sitio no dijo nada). Para sumar por reunión:
 * `split_part(origen, ' ', 1)` en SQL, o `reunionDelOrigen` acá.
 */
export function origenDeLaFila(ctx: ContextoDeCorrida | undefined): string | null {
  const sitio = ctx?.origen ?? null;
  if (!ctx?.reunionId) return sitio;
  const reunion = `${PREFIJO_DE_LA_REUNION}${ctx.reunionId}`;
  return sitio ? `${reunion}${SEPARADOR_DEL_ORIGEN}${sitio}` : reunion;
}

/** La reunión de un `origen` guardado, o null si la llamada no la disparó la lectura de una reunión. */
export function reunionDelOrigen(origen: string | null | undefined): string | null {
  if (!origen || !origen.startsWith(PREFIJO_DE_LA_REUNION)) return null;
  const resto = origen.slice(PREFIJO_DE_LA_REUNION.length);
  const fin = resto.indexOf(" ");
  const id = fin === -1 ? resto : resto.slice(0, fin);
  return id || null;
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
