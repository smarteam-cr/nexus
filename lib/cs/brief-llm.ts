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
 */
import { anthropic } from "@/lib/anthropic";

export const BRIEF_MODEL = "claude-sonnet-4-6";
/**
 * Holgura de tokens: con 3000 se truncaba en cuentas cargadas (varias minutas + partner +
 * señales), el output quedaba a medias y el parse tiraba un error genérico.
 */
export const BRIEF_MAX_TOKENS = 5000;

/**
 * Pide el brief y devuelve el texto crudo. El parseo y la validación de citas son de
 * `brief-citas.ts` — acá no se interpreta nada.
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
      messages: [
        { role: "user", content: `${serialized}\n\n${instruccion} Devolvé SOLO el JSON.${extra}` },
      ],
    });
  const textoDe = (msg: Awaited<ReturnType<typeof pedir>>) =>
    msg.content
      .map((b) => (b.type === "text" ? (b as { text: string }).text : ""))
      .join("")
      .trim();

  let msg = await pedir("");
  if (msg.stop_reason === "max_tokens") {
    // Reintento CONCISO: repetir igual volvería a cortar en el mismo lugar.
    msg = await pedir("\n\nIMPORTANTE: sé conciso — máximo 8 afirmaciones, sin repetir.");
    if (msg.stop_reason === "max_tokens") throw new Error("output del agente truncado (max_tokens)");
  }
  return textoDe(msg);
}
