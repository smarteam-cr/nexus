/**
 * lib/ai/lotes-manejadores.ts — QUIÉN RECIBE LA RESPUESTA DE CADA TIPO DE PEDIDO POR LOTE. Lista explícita (sin
 * registro por side-effect, como lib/jobs/defs.ts): sumar un tipo es una línea acá y una en `TIPOS_DE_LOTE`.
 * Los módulos se cargan recién cuando hace falta, para que lib/ai no arrastre los de cada agente.
 */
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { TipoDeLote } from "./lotes";

export interface ManejadorDeLote {
  /**
   * Aplica una respuesta que llegó bien. Devuelve la corrida (`AgentRun`) que dejó, si dejó una: el medidor la anota
   * con la llamada. Si lanza, el pedido queda en error con el mensaje (la llamada igual se anota: se pagó).
   */
  aplicar(p: { pedidoId: string; contexto: unknown; mensaje: Anthropic.Messages.Message }): Promise<{ agentRunId?: string | null }>;
  /** Avisa que el pedido no va a volver (error de Anthropic o vencido), por si hay que soltar algo. */
  alFallar?(p: { pedidoId: string; contexto: unknown; error: string }): Promise<void>;
}

export const MANEJADORES: Record<TipoDeLote, () => Promise<ManejadorDeLote>> = {
  "vigia-barrido": () => import("@/lib/cs/watchdog").then((m) => m.manejadorDelVigiaEnLote),
};
