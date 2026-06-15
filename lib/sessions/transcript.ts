/**
 * lib/sessions/transcript.ts
 *
 * Lee el contenido de transcript/summary de una FirefliesSession desde la caché
 * local (DB) y lo serializa a markdown listo para inyectar en el prompt de un
 * agente. Soporta dos shapes de summary (Fireflies y Google Meet / Gemini Notes).
 *
 * Extraído de app/api/clients/[id]/analyze/route.ts (donde vivía privado) para
 * compartirlo entre el handoff, el cronograma vivo (D.2) y cualquier agente que
 * necesite leer sesiones pasadas. Best-effort: devuelve null si no hay contenido.
 */
import { prisma } from "@/lib/db/prisma";

export async function fetchTranscriptContent(sessionId: string, title: string): Promise<string | null> {
  // Intentar leer de la caché DB primero
  try {
    const cached = await prisma.firefliesSession.findUnique({
      where: { id: sessionId },
      select: { summary: true, transcript: true, title: true },
    });

    if (cached?.summary || cached?.transcript) {
      const parts: string[] = [`### Sesión: ${cached.title || title}`];
      // Shape soportado por dos fuentes:
      //   - Fireflies: keywords + overview + action_items + shorthand_bullet
      //   - Google Meet / Gemini Notes: keywords + overview + sections[]
      //     donde sections = [{ title, content }]
      // OJO: el shape del summary difiere por fuente.
      //   - Fireflies: action_items es STRING, overview STRING, keywords STRING[].
      //   - Google Meet / Gemini Notes: action_items es STRING[], overview STRING,
      //     keywords STRING[], sections [{title, content}].
      // Antes asumíamos action_items string y `s.action_items.trim()` lanzaba
      // "trim is not a function" para Google Meet → el catch tragaba la excepción
      // → la función devolvía null → fallback "transcript no disponible" aunque
      // SÍ había transcript. Normalizamos cualquier campo string|string[]→string.
      const s = cached.summary as {
        keywords?: string | string[];
        overview?: string | string[];
        action_items?: string | string[];
        sections?: Array<{ title?: string; content?: string }>;
      } | null;
      const asText = (v: unknown): string =>
        Array.isArray(v) ? v.filter((x) => typeof x === "string").join("\n- ")
        : typeof v === "string" ? v : "";
      const keywords = asText(s?.keywords);
      const overview = asText(s?.overview);
      const actionItems = asText(s?.action_items);
      if (keywords.trim()) parts.push(`**Temas clave:** ${keywords.trim()}`);
      if (overview.trim()) parts.push(`**Resumen:**\n${overview.trim().slice(0, 1500)}`);
      if (actionItems.trim()) parts.push(`**Compromisos:**\n${actionItems.trim().slice(0, 800)}`);
      // Gemini Notes sections — donde vive el detalle real de la reunión
      // (Presentación del cliente, Dolores, Acuerdos, Próximos pasos, etc.).
      // SIN esto, el helper devolvía solo el overview genérico de 1-2 líneas.
      if (Array.isArray(s?.sections) && s!.sections!.length > 0) {
        const sectionsMd = s!.sections!
          .filter((sec) => sec?.title?.trim() && sec?.content?.trim())
          .map((sec) => `**${sec.title!.trim()}:**\n${sec.content!.trim().slice(0, 1200)}`)
          .join("\n\n");
        if (sectionsMd) parts.push(sectionsMd);
      }
      // Si después de todo el summary terminó pobre (<1500 chars de content
      // sumando todo excepto el header de sesión), complementar con el
      // transcript crudo. Esto cubre sesiones donde el summary es muy de alto
      // nivel y los acuerdos específicos viven en el transcript palabra-por-palabra.
      const summaryContentLen = parts.slice(1).join("").length;
      if (summaryContentLen < 1500 && cached.transcript?.trim()) {
        parts.push(`**Transcript (extracto):**\n${cached.transcript.slice(0, 5000)}`);
      }
      // Fallback histórico: si NO había nada de summary y hay transcript, usarlo.
      if (parts.length === 1 && cached.transcript?.trim()) parts.push(cached.transcript.slice(0, 5000));
      if (parts.length > 1) return parts.join("\n\n");
    }
  } catch (dbErr) {
    // NO tragar la excepción en silencio: loggearla. Un bug de shape del summary
    // (action_items array vs string) se tragaba acá y devolvía null → "transcript
    // no disponible" aunque sí había transcript. Si vuelve a pasar, lo veremos.
    console.error(`[fetchTranscriptContent] Error leyendo transcript de DB (id=${sessionId}):`, dbErr instanceof Error ? dbErr.message : dbErr);
  }

  // Sin fallback a API externa: la fuente de transcripts es exclusivamente la
  // caché local FirefliesSession (alimentada por el enriquecimiento de Google Meet).
  return null;
}
