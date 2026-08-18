/**
 * lib/ai/medidor.ts — ANOTAR LO QUE COSTÓ CADA LLAMADA A CLAUDE.
 *
 * Lo llama `lib/anthropic.ts`, que es el único punto por donde pasan las llamadas del sistema.
 * Acá solo vive el «qué se anota y cómo», para que el proxy se quede con el «cuándo».
 *
 * ── LA REGLA QUE GOBIERNA ESTE ARCHIVO ───────────────────────────────────────
 * ⛔ EL MEDIDOR NO PUEDE ROMPER UNA CORRIDA. Nada de lo que pase acá —la base caída, un `usage`
 * con otra forma, un modelo sin tarifa— puede tumbar un handoff que el CSE está esperando. Por eso
 * la escritura es fire-and-forget con su propio catch, y todo lo que se lee de la respuesta se
 * lee a la defensiva.
 *
 * El costo de esa decisión, dicho: si la base está caída se pierde la fila y nadie se entera. Es
 * el intercambio correcto —medir es secundario respecto de trabajar— pero no es gratis, y por eso
 * el total de este libro se cruza contra la consola de Anthropic, no se toma como verdad.
 */
import { prisma } from "@/lib/db/prisma";
import { costoDeLlamada } from "./precios";
import { contextoDeIA, type ContextoDeCorrida } from "./contexto-de-corrida";

/** La forma de `response.usage` del SDK, leída a la defensiva: los campos de caché son opcionales. */
export interface UsageCrudo {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

const num = (v: number | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;

export interface LlamadaMedida {
  model: string;
  usage?: UsageCrudo | null;
  durationMs: number;
  ok: boolean;
  /** Nombre del error cuando falló (`RateLimitError`, `APIConnectionError`…). */
  errorType?: string | null;
  /** Contexto explícito; si no viene, se toma el de `AsyncLocalStorage`. */
  ctx?: ContextoDeCorrida;
}

/**
 * Anota una llamada. **No se espera**: devuelve enseguida y escribe en segundo plano.
 *
 * ⚠ Se anota AUNQUE la llamada haya fallado (`ok: false`). Un 429 o un timeout puede haber
 * consumido tokens de entrada igual, y sobre todo: una racha de errores es la señal más temprana
 * de que algo se disparó en loop. Filtrarlos escondería justo el caso que hay que ver.
 */
export function registrarLlamada(datos: LlamadaMedida): void {
  try {
    const ctx = datos.ctx ?? contextoDeIA() ?? {};
    const u = datos.usage ?? {};

    const inputTokens = num(u.input_tokens);
    const outputTokens = num(u.output_tokens);
    const cacheReadTokens = num(u.cache_read_input_tokens);
    const cacheCreationTokens = num(u.cache_creation_input_tokens);

    const costUsd = costoDeLlamada(datos.model, {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
    });

    void prisma.llmCall
      .create({
        data: {
          model: datos.model,
          ok: datos.ok,
          errorType: datos.errorType ?? null,
          durationMs: Math.max(0, Math.round(datos.durationMs)),
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
          costUsd,
          agentSlug: ctx.agentSlug ?? null,
          agentRunId: ctx.agentRunId ?? null,
          clientId: ctx.clientId ?? null,
          projectId: ctx.projectId ?? null,
          triggeredByEmail: ctx.triggeredByEmail ?? null,
          origen: ctx.origen ?? null,
        },
      })
      .catch((e) => {
        // A propósito `console.error` y no `report-error`: si la base está caída, el reporte de
        // errores probablemente también, y un medidor que insiste agrava el incidente que mide.
        console.error("[medidor] no se pudo anotar la llamada:", e instanceof Error ? e.message : e);
      });
  } catch (e) {
    console.error("[medidor] fallo al armar la fila:", e instanceof Error ? e.message : e);
  }
}

/** El nombre del error, para poder agrupar por causa sin guardar el mensaje entero. */
export function tipoDeError(e: unknown): string {
  if (e && typeof e === "object" && "constructor" in e) {
    const n = (e as { constructor?: { name?: string } }).constructor?.name;
    if (n && n !== "Object") return n;
  }
  return e instanceof Error ? e.name : "desconocido";
}
