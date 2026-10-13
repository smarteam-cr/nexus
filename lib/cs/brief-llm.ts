/**
 * lib/cs/brief-llm.ts — LA LLAMADA AL MODELO PARA UN BRIEF CITADO, CON SU REINTENTO.
 *
 * ── POR QUÉ VIVE APARTE (2026-08-16) ─────────────────────────────────────────
 * Era privada de `account-brief.ts`. Al aparecer el brief por PROYECTO había dos caminos: copiar
 * quince líneas, o compartirlas. La copia diverge callada — alguien sube el tope de tokens de un
 * lado porque «se truncaba» y el otro documento sigue truncándose, con el mismo síntoma genérico
 * («la IA devolvió un resumen incompleto») y ninguna pista de por qué solo pasa en uno.
 *
 * ── EL REINTENTO NO ES UN RETRY GENÉRICO ─────────────────────────────────────
 * Los errores transitorios de la API (429, 5xx, 529) ya los reintenta el SDK de Anthropic solo.
 * Éste cubre otra cosa: que la respuesta se CORTE por `max_tokens`. Ahí reintentar igual daría el
 * mismo corte, así que el segundo intento pide explícitamente ser más breve. Si vuelve a cortarse,
 * se rinde con un error que dice la causa real en vez de un JSON a medias que el parser
 * reportaría como «malformado» — que mandaría a buscar el problema al lugar equivocado.
 *
 * ── LA SALIDA ES UNA HERRAMIENTA (2026-10-12) ────────────────────────────────
 * El modelo escribía el JSON como texto y, con citas que traen comillas rectas sin escapar, a veces
 * no se podía leer («output del agente con JSON inválido», el resumen de Honda FACO el 10 y el 12 de
 * octubre). Ahora la respuesta llega por una herramienta forzada (`registrar_brief`): la API arma el
 * objeto, así que no hay comillas que escapar. Se devuelve como JSON para que `brief-citas.ts` lo
 * valide igual que siempre.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";

export const BRIEF_MODEL = "claude-sonnet-4-6";
/**
 * Holgura de tokens: con 3000 se truncaba en cuentas cargadas (varias minutas + partner +
 * señales), el output quedaba a medias y el parse tiraba un error genérico.
 */
export const BRIEF_MAX_TOKENS = 5000;

/** La forma del brief. `narrativa` es opcional: el brief de CUENTA no la pide. */
const HERRAMIENTA_DEL_BRIEF: Anthropic.Tool = {
  name: "registrar_brief",
  description: "Registra el resumen con cada afirmación y la fuente que la respalda.",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "La frase de arriba del resumen." },
      narrativa: { type: "string", description: "Dos o tres párrafos, si las instrucciones la piden." },
      statements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            source: { type: "string", description: "La etiqueta de la fuente, tal como aparece en el material." },
          },
          required: ["text", "source"],
        },
      },
    },
    required: ["headline", "statements"],
  },
};

/**
 * Pide el brief y devuelve su JSON. El parseo y la validación de citas son de `brief-citas.ts`:
 * acá no se interpreta nada.
 *
 * @param instruccion qué se le pide redactar; es lo único que cambia entre cuenta y proyecto.
 */
export async function generarTextoDeBrief(
  systemPrompt: string,
  serialized: string,
  instruccion: string,
): Promise<string> {
  const pedir = (extra: string) =>
    anthropic.messages.create({
      model: BRIEF_MODEL,
      max_tokens: BRIEF_MAX_TOKENS,
      system: systemPrompt,
      tools: [HERRAMIENTA_DEL_BRIEF],
      tool_choice: { type: "tool", name: HERRAMIENTA_DEL_BRIEF.name },
      messages: [
        {
          role: "user",
          // C-03 (2026-09-04): el contexto serializado es el prefijo estable — el reintento conciso
          // lo relee de la caché a 0,1× en vez de pagarlo entero dos veces. La instrucción y el
          // `extra` cambian entre intentos: van DESPUÉS del breakpoint. Bajo el mínimo cacheable
          // (1.024 tokens en Sonnet) la marca no hace nada, y no falla.
          content: [
            { type: "text", text: serialized, cache_control: { type: "ephemeral" } },
            { type: "text", text: `\n\n${instruccion} Entrégalo con la herramienta ${HERRAMIENTA_DEL_BRIEF.name}.${extra}` },
          ],
        },
      ],
    });
  /* Sin el bloque de la herramienta (no debería pasar con tool_choice forzado) cae al texto: el parser
     dice entonces qué faltó. */
  const salidaDe = (msg: Awaited<ReturnType<typeof pedir>>) => {
    const uso = msg.content.find((b) => b.type === "tool_use");
    if (uso && uso.type === "tool_use") return JSON.stringify(uso.input);
    return msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
  };

  let msg = await pedir("");
  if (msg.stop_reason === "max_tokens") {
    // Reintento CONCISO: repetir igual volvería a cortar en el mismo lugar.
    msg = await pedir("\n\nIMPORTANTE: sé conciso — máximo 8 afirmaciones, sin repetir.");
    if (msg.stop_reason === "max_tokens") throw new Error("output del agente truncado (max_tokens)");
  }
  return salidaDe(msg);
}
