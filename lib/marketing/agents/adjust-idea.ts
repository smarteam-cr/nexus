/**
 * lib/marketing/agents/adjust-idea.ts
 *
 * Ajuste puntual del copy de una idea con IA (UNA pasada, NO-streaming). Toma el
 * copy actual + una instrucción libre ("más corto", "más formal") y devuelve el
 * copy reescrito. Espejo del patrón `regenerateSectionData` de Business Cases:
 * el agente DEVUELVE el texto, no persiste (el guardado va por el PATCH del front).
 *
 * No inventa datos ni cambia el tema; preserva el idioma y la voz del copy actual
 * y respeta la voz de marca (MarketingSettings.brandVoice) si está.
 */
import { anthropic } from "@/lib/anthropic";

const MODEL = "claude-sonnet-4-6";
const MAX_COPY_CHARS = 4000; // = límite del `copy` en generatedContentIdeaSchema

export async function adjustIdeaCopy(
  currentCopy: string,
  instruction: string,
  brandVoice?: string | null,
): Promise<string> {
  const voice = brandVoice?.trim() ? `\n\nVOZ DE MARCA (respetala):\n${brandVoice.trim()}` : "";

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: `Editás el copy de una publicación de redes sociales de Smarteam según una instrucción.
Devolvé SOLO el copy reescrito, en texto plano (sin markdown, sin comillas envolventes, sin encabezados ni comentarios).
No inventes datos que no estén en el copy actual o la instrucción. Mantené el tema y el mensaje central, y preservá el idioma y la voz del copy actual; ajustá únicamente lo que pide la instrucción.${voice}`,
    messages: [
      {
        role: "user",
        content: `Copy actual:\n${currentCopy}\n\nInstrucción: ${instruction}\n\nDevolvé el copy reescrito.`,
      },
    ],
  });

  const text = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  return text.slice(0, MAX_COPY_CHARS);
}
