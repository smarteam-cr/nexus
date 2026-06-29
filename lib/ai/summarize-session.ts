/**
 * lib/ai/summarize-session.ts
 *
 * Genera un resumen estructurado y legible de una transcripción usando Claude.
 */

import { getAnthropic } from "@/lib/anthropic";

export interface SummarySection {
  title: string;
  content: string;
}

export interface AISummary {
  overview: string;           // 2-3 oraciones de resumen ejecutivo
  sections: SummarySection[]; // secciones temáticas de la reunión
  keywords: string[];
  action_items: string[];
}

const MAX_TRANSCRIPT_FOR_AI = 60_000;

export async function summarizeTranscript(
  title: string,
  transcript: string
): Promise<AISummary | null> {
  const trimmed = transcript.trim();
  if (trimmed.length < 200) return null;

  const excerpt = trimmed.slice(0, MAX_TRANSCRIPT_FOR_AI);
  const wasTruncated = trimmed.length > MAX_TRANSCRIPT_FOR_AI;

  try {
    const anthropic = getAnthropic();

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Eres un asistente experto en analizar reuniones de negocios. Analiza esta transcripción y genera un resumen profesional y bien estructurado en español.

Título: ${title}${wasTruncated ? "\n(Nota: transcripción truncada por longitud)" : ""}

TRANSCRIPCIÓN:
${excerpt}

Responde ÚNICAMENTE con JSON válido usando esta estructura exacta:

{
  "overview": "Párrafo de 2-3 oraciones que resuma el propósito y resultado principal de la reunión. Directo y ejecutivo.",
  "sections": [
    {
      "title": "Nombre del tema o bloque de la reunión",
      "content": "Explicación detallada de ese tema: qué se discutió, qué se decidió, qué información relevante surgió. Puede ser de 2-4 oraciones."
    }
  ],
  "keywords": ["Tema clave 1", "Tema clave 2", "Herramienta o concepto importante"],
  "action_items": [
    "Tarea concreta con responsable si se mencionó — ej: Juan debe enviar propuesta antes del viernes",
    "Otra tarea acordada"
  ]
}

Instrucciones:
- sections: identifica 3-6 temas o bloques principales de la reunión. Cada sección tiene título descriptivo y contenido detallado.
- Si la reunión trató un solo tema, agrupa en subsecciones (contexto, demostración, decisiones, etc.).
- keywords: 5-8 términos clave, herramientas, nombres de proyectos o conceptos importantes.
- action_items: SOLO tareas o compromisos concretos. Si no hubo ninguno, usar array vacío [].
- Todo el contenido en español, con TUTEO neutro ("tú") si te diriges al lector — nunca voseo ("tenés", "querés", "Transformá").
- NO uses markdown dentro del JSON (sin **, sin #, sin guiones como bullets).`,
        },
      ],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[summarize] JSON no encontrado en respuesta:", rawText.slice(0, 300));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<AISummary>;

    const sections: SummarySection[] = Array.isArray(parsed.sections)
      ? parsed.sections
          .filter((s): s is SummarySection =>
            typeof s === "object" && typeof s.title === "string" && typeof s.content === "string"
          )
          .map((s) => ({ title: s.title.trim(), content: s.content.trim() }))
      : [];

    return {
      overview: typeof parsed.overview === "string" ? parsed.overview.trim() : "",
      sections,
      keywords: Array.isArray(parsed.keywords)
        ? parsed.keywords.filter((k): k is string => typeof k === "string").map((k) => k.trim())
        : [],
      action_items: Array.isArray(parsed.action_items)
        ? parsed.action_items.filter((a): a is string => typeof a === "string").map((a) => a.trim())
        : [],
    };
  } catch (err) {
    console.error("[summarize] Error:", err instanceof Error ? err.message : err);
    return null;
  }
}
