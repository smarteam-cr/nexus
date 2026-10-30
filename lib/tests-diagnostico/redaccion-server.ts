/**
 * lib/tests-diagnostico/redaccion-server.ts — REDACTAR el resultado del test con Haiku, una vez, al terminarlo (29 oct).
 * SERVIDOR. Lo puro (el pedido, la revisión y el texto sin IA) vive en ./redaccion.ts.
 *
 * Pasa por `lib/anthropic.ts` como toda llamada: queda medida en `LlmCall` con el slug `resultado-del-test` (y la
 * empresa de Nexus, si el correo la unió) y la cubre el tope de gasto del día. Espera a lo sumo
 * `ESPERA_DE_LA_REDACCION_MS`, no reintenta y tiene su propio tope por hora (`REDACCIONES_POR_HORA`): la persona está esperando su resultado, y sin redacción la página sale
 * con los textos de los datos. NUNCA lanza.
 */
import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { parseObject } from "@/lib/ai/section-schema";
import type { Escala } from "@/lib/escala/documento/tipos";
import type { ResultadoDelTest } from "./resultado";
import type { PreguntaDelBanco, RespuestasDelTest } from "./tipos";
import {
  ESPERA_DE_LA_REDACCION_MS,
  leerLaRedaccion,
  pedidosDeLaRedaccion,
  SLUG_DE_LA_REDACCION,
  type RedaccionDelResultado,
} from "./redaccion";
import { TopeDeRedacciones } from "./una-sola-vez";

/** El tope propio del test público (./una-sola-vez.ts): su gasto no se come el presupuesto de los procesos de Nexus. */
const tope = new TopeDeRedacciones();

export async function redactarElResultado(o: {
  escala: Escala;
  r: ResultadoDelTest;
  industria: string | null;
  preguntas: readonly PreguntaDelBanco[];
  respuestas: RespuestasDelTest;
  clientId: string | null;
}): Promise<RedaccionDelResultado | null> {
  if (!o.r.nivel || !process.env.ANTHROPIC_API_KEY) return null;
  if (!tope.permitir(Date.now())) {
    console.warn("[tests-diagnostico] sin redacción: se llegó al tope de redacciones por hora del test público");
    return null;
  }
  try {
    // El resumen y cada capa van en paralelo: una que falla o tarda no se lleva a las otras.
    const respuestas = await Promise.all(
      pedidosDeLaRedaccion(o).map(({ parte, pedido }) =>
        conContextoDeIA({ agentSlug: SLUG_DE_LA_REDACCION, clientId: o.clientId, origen: `tests-diagnostico/terminar › ${parte}` }, () =>
          getAnthropic().messages.create(pedido, { timeout: ESPERA_DE_LA_REDACCION_MS, maxRetries: 0 }),
        ).catch((e: unknown) => {
          console.error(`[tests-diagnostico] sin redacción (${parte}):`, e instanceof Error ? e.message : e);
          return null;
        }),
      ),
    );
    const redaccion = leerLaRedaccion(respuestas, { escala: o.escala, r: o.r, parse: parseObject, ahora: new Date(), industria: o.industria });
    // Lo que se pagó y no pasó la revisión, para saber cuánto se descarta (el texto de la IA no se escribe en el log).
    const esperadas = o.r.dimensiones.filter((d) => d.preguntada && d.nivel).length;
    const llegaron = Object.values(redaccion?.dimensiones ?? {}).filter((d) => d.impacto).length;
    if (!redaccion?.resumen || llegaron < esperadas) {
      console.warn(`[tests-diagnostico] redacción incompleta: resumen ${redaccion?.resumen ? "sí" : "no"}, impactos ${llegaron} de ${esperadas}`);
    }
    return redaccion;
  } catch (e) {
    console.error("[tests-diagnostico] sin redacción del resultado:", e instanceof Error ? e.message : e);
    return null;
  }
}
