/**
 * lib/landing/adaptar-modulo-server.ts — «Adaptar a esta empresa»: la llamada al modelo.
 *
 * El pedido y la lectura son puros (`adaptar-modulo.ts`); acá vive solo la llamada, con su corrida
 * (`AgentRun`, agentSlug "business-case", paso «Adaptar un módulo») y su medidor. Lo dispara una
 * persona desde el editor de la propuesta, una sección a la vez: nunca corre solo.
 */
import "server-only";
import { anthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { prisma } from "@/lib/db/prisma";
import {
  SISTEMA_DE_ADAPTACION,
  armarPedidoDeAdaptacion,
  leerRespuestaDeAdaptacion,
  segmentosDelPedido,
  type ContextoDeAdaptacion,
  type PropuestaDeAdaptacion,
} from "./adaptar-modulo";
import { extraerTextos } from "./html-textos";

const MODEL = "claude-sonnet-4-6";
/** Sin streaming: por debajo de 21.333 (ver DECISIONS «FIX streaming»). */
const MAX_TOKENS = 12_000;

export class SinTextosQueAdaptar extends Error {}

export async function adaptarHtml(input: {
  html: string;
  contexto: ContextoDeAdaptacion;
  businessCaseId: string;
  clientId: string;
  triggeredByEmail: string | null;
}): Promise<PropuestaDeAdaptacion & { runId: string }> {
  const segmentos = extraerTextos(input.html);
  if (segmentos.length === 0) throw new SinTextosQueAdaptar("Esta sección no tiene textos que adaptar.");
  const { entran, sinRevisar } = segmentosDelPedido(segmentos);

  const run = await prisma.agentRun.create({
    data: {
      agentSlug: "business-case",
      businessCaseId: input.businessCaseId,
      clientId: input.clientId,
      status: "RUNNING",
      stepLabel: "Adaptar un módulo · Propuesta comercial",
      triggeredByEmail: input.triggeredByEmail,
    },
    select: { id: true },
  });

  try {
    const msg = await conContextoDeIA(
      {
        agentSlug: "business-case",
        agentRunId: run.id,
        clientId: input.clientId,
        triggeredByEmail: input.triggeredByEmail,
        origen: "propuesta › adaptar módulo",
      },
      () =>
        anthropic.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SISTEMA_DE_ADAPTACION,
          messages: [{ role: "user", content: armarPedidoDeAdaptacion(input.contexto, entran) }],
        }),
    );
    // Una respuesta cortada no se aplica a medias: mejor decirlo que proponer la mitad de los cambios.
    if (msg.stop_reason === "max_tokens") {
      throw new Error("La respuesta de la IA salió cortada: el módulo tiene demasiado texto. Prueba de nuevo.");
    }
    const texto = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const propuesta = leerRespuestaDeAdaptacion(texto, entran, sinRevisar);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        // Lo propuesto, para la trazabilidad (§6). No el HTML: ya vive en la sección.
        output: JSON.stringify({ cambios: propuesta.cambios.length, notas: propuesta.notas, sinRevisar }),
      },
    });
    return { ...propuesta, runId: run.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo adaptar el módulo.";
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error: message }) } })
      .catch(() => {});
    throw e;
  }
}
