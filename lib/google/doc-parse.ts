/**
 * lib/google/doc-parse.ts — CÓMO SE LEE un documento de Gemini Notes. Puro, sin googleapis
 * ni Prisma: la política de parseo entera se puede escribir como una tabla en un test.
 *
 * ── LA TRAMPA QUE ESTO MATA (2026-08-08) ─────────────────────────────────────
 * El parseo vivía inline en `meet-enrichment.ts` con esta forma:
 *
 *     if (transcriptTab || notesTab) { … transcript = transcriptTab ? … : null; … }
 *
 * Si el doc matcheaba SOLO la pestaña de notas —porque Google renombró la de transcripción,
 * o la nombró en otro idioma— la rama devolvía `transcript: null` y NUNCA caía al fallback
 * de «unir todo»: un transcript completo, presente en el documento, se perdía total y
 * silenciosamente. Medido contra producción: ~464 sesiones con notas de Gemini larguísimas
 * y transcript vacío — el ~20% del hueco de transcripciones que disparó esta tanda.
 *
 * La salida no es adivinar más nombres: es que cuando no hay pestaña reconocida, se
 * PROMUEVE por contenido — el tab más grande que parezca un diálogo (patrón de hablantes)
 * es el transcript, se llame como se llame.
 *
 * ── EL DIAGNÓSTICO VIAJA EN EL RESULTADO ─────────────────────────────────────
 * Cada parseo dice QUÉ pestañas vio y POR QUÉ decidió lo que decidió (`motivo`). Hasta hoy
 * eso era un `console.log` en el stdout del VPS que la rotación de logs borra — por eso la
 * investigación del 2026-08-08 tuvo que INFERIR las causas en vez de leerlas. R2 persiste
 * este diagnóstico en la fila.
 */

// Movidos TAL CUAL de meet-enrichment.ts — la fuente única de los topes de lectura.
export const MAX_TRANSCRIPT_CHARS = 150_000; // ~25 000 palabras — suficiente para reuniones largas
export const MAX_NOTES_CHARS = 10_000; // resumen de Gemini Notes

/** El mínimo para que un texto cuente como transcript real (mismo umbral que post-process). */
export const MIN_TRANSCRIPT_CHARS = 200;

/** Piso para PROMOVER un tab no reconocido a transcript: exige contenido de verdad. */
const MIN_CHARS_PARA_PROMOVER = 1_000;

export interface DocTab {
  tabProperties?: { title?: string | null };
  documentTab?: {
    body?: {
      content?: Array<{
        paragraph?: { elements?: Array<{ textRun?: { content?: string | null } }> };
      }>;
    };
  };
}

export type MotivoParse =
  /** Pestaña de transcripción reconocida por nombre — el caso feliz de siempre. */
  | "pestana_reconocida"
  /** Sin pestaña reconocida; se promovió otro tab por tamaño + patrón de hablantes. */
  | "promovido_por_contenido"
  /** Solo se encontraron notas: ningún tab tenía pinta de transcript ni daba para promover. */
  | "solo_notas"
  /** Ningún tab matcheó nada: se unió todo el contenido (comportamiento histórico). */
  | "union_de_tabs"
  /** Lo leído es un esqueleto de plantilla sin contenido real — NO cuenta como transcript. */
  | "plantilla_vacia"
  /** El doc no trajo tabs; se leyó el body completo. */
  | "body_sin_tabs"
  /** No quedó ningún texto utilizable. */
  | "vacio";

export interface DocParseado {
  transcript: string | null;
  summary: { overview: string } | null;
  diagnostico: { tabsVistos: string[]; motivo: MotivoParse };
}

export function extractTabText(tab: DocTab): string {
  return (tab.documentTab?.body?.content ?? [])
    .flatMap((b) => b.paragraph?.elements ?? [])
    .map((el) => el.textRun?.content ?? "")
    .join("")
    .trim();
}

function findTabByKeyword(tabs: DocTab[], ...keywords: string[]): DocTab | undefined {
  return tabs.find((tab) => {
    const title = (tab.tabProperties?.title ?? "").toLowerCase();
    return keywords.some((kw) => title.includes(kw.toLowerCase()));
  });
}

/**
 * ¿Este texto parece un DIÁLOGO? Es el requisito para promover un tab no reconocido: el
 * tamaño solo no alcanza (un acta larga también es grande). Dos señales, cualquiera vale:
 *  · ≥5 líneas con forma «Hablante: dijo algo» — el formato de la transcripción de Meet.
 *  · ≥3 marcas de tiempo (00:12, 1:03:45…), el formato de un VTT o transcript timestampeado.
 */
export function tienePatronDeHablantes(texto: string): boolean {
  const lineasDeHablante = texto.match(/^[^\s:][^:\n]{1,59}:\s\S/gm)?.length ?? 0;
  if (lineasDeHablante >= 5) return true;
  const marcasDeTiempo = texto.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g)?.length ?? 0;
  return marcasDeTiempo >= 3;
}

/**
 * ¿Es el esqueleto de la plantilla, sin reunión adentro? Medido: 66 filas con «transcripts»
 * de menos de 200 caracteres que contaban como éxito — encabezados de Gemini sin una sola
 * línea de conversación. El detector es DELIBERADAMENTE conservador: solo el largo. Un
 * transcript real de 200+ caracteres jamás se descarta por forma.
 */
export function esPlantillaVacia(texto: string): boolean {
  return texto.trim().length < MIN_TRANSCRIPT_CHARS;
}

/** Recorta y normaliza a `null` lo que no llega a contenido real. */
function comoTranscript(texto: string): string | null {
  const t = texto.trim().slice(0, MAX_TRANSCRIPT_CHARS);
  return t || null;
}

/**
 * PURA. Un doc CON tabs → qué es transcript, qué es resumen, y por qué.
 *
 * El orden de decisión es la política completa:
 *  1. Pestaña de transcripción reconocida por nombre → es el transcript.
 *  2. Sin ella: se PROMUEVE el tab restante más grande que parezca diálogo (≥1.000 chars +
 *     patrón de hablantes). Es lo que rescata un transcript con la pestaña renombrada.
 *  3. Sin promovible pero con notas → solo notas (el caso que antes se llevaba todo por
 *     delante: ahora es el ÚLTIMO recurso, no el primero).
 *  4. Ningún tab reconocido → unir todo (comportamiento histórico), filtrando plantilla.
 */
export function parseDocTabs(tabs: DocTab[]): DocParseado {
  const tabsVistos = tabs.map((t) => t.tabProperties?.title ?? "(sin título)");
  const diag = (motivo: MotivoParse) => ({ tabsVistos, motivo });

  const transcriptTab = findTabByKeyword(tabs, "transcripci", "transcript");
  const notesTab = findTabByKeyword(
    tabs.filter((t) => t !== transcriptTab),
    "notas", "gemini", "notes", "summary", "resumen",
  );
  const notesText = notesTab ? extractTabText(notesTab) : null;
  const summary = notesText ? { overview: notesText.slice(0, MAX_NOTES_CHARS) } : null;

  if (transcriptTab) {
    const texto = extractTabText(transcriptTab);
    if (esPlantillaVacia(texto)) {
      return { transcript: null, summary, diagnostico: diag("plantilla_vacia") };
    }
    return { transcript: comoTranscript(texto), summary, diagnostico: diag("pestana_reconocida") };
  }

  // Sin pestaña reconocida: buscar el diálogo por CONTENIDO entre los tabs restantes.
  const candidatos = tabs
    .filter((t) => t !== notesTab)
    .map((t) => extractTabText(t))
    .filter((texto) => texto.length >= MIN_CHARS_PARA_PROMOVER && tienePatronDeHablantes(texto))
    .sort((a, b) => b.length - a.length);
  if (candidatos.length > 0) {
    return {
      transcript: comoTranscript(candidatos[0]),
      summary,
      diagnostico: diag("promovido_por_contenido"),
    };
  }

  if (notesTab) {
    return { transcript: null, summary, diagnostico: diag("solo_notas") };
  }

  // Ningún tab matcheó nada: unir todo (histórico), pero sin dejar pasar la plantilla.
  const todo = tabs.map((t) => extractTabText(t)).filter(Boolean).join("\n\n").trim();
  if (!todo) return { transcript: null, summary: null, diagnostico: diag("vacio") };
  if (esPlantillaVacia(todo)) {
    return { transcript: null, summary: null, diagnostico: diag("plantilla_vacia") };
  }
  return { transcript: comoTranscript(todo), summary: null, diagnostico: diag("union_de_tabs") };
}

/** PURA. Un doc SIN tabs: el body entero es el candidato, con el mismo filtro de plantilla. */
export function parseDocBody(bodyText: string): DocParseado {
  const diag = (motivo: MotivoParse) => ({ tabsVistos: [] as string[], motivo });
  const t = bodyText.trim();
  if (!t) return { transcript: null, summary: null, diagnostico: diag("vacio") };
  if (esPlantillaVacia(t)) {
    return { transcript: null, summary: null, diagnostico: diag("plantilla_vacia") };
  }
  return { transcript: comoTranscript(t), summary: null, diagnostico: diag("body_sin_tabs") };
}
