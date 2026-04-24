/**
 * lib/google/meet-enrichment.ts
 *
 * Enriquecimiento de sesiones Google Meet en dos fases:
 *
 * FASE 1 — Doc adjunto (googleDocId en el evento del calendario):
 *   Lee el Google Doc (Gemini Notes) con tabs de Transcripción y Notas.
 *
 * FASE 2 — Búsqueda en Drive (sesiones sin doc adjunto):
 *   Busca en Drive del organizador archivos creados ±2 días del meet:
 *   - VTT (transcript nativo de Google Meet)
 *   - Google Docs con keywords del título de la reunión
 */

import { google } from "googleapis";
import { prisma } from "@/lib/db/prisma";
import { getImpersonatedAuth } from "@/lib/google/auth";
import { summarizeTranscript } from "@/lib/ai/summarize-session";

// ── Constantes ────────────────────────────────────────────────────────────────

const MAX_TRANSCRIPT_CHARS = 150_000; // ~25 000 palabras — suficiente para reuniones largas
const MAX_NOTES_CHARS      =  10_000; // resumen de Gemini Notes
const DRIVE_SEARCH_WINDOW_DAYS = 3;   // buscar ±3 días alrededor de la reunión
const DOC_BATCH  = 10;                // sesiones en paralelo para Pasada 1 (Google Docs)
const DRIVE_BATCH = 5;                // sesiones en paralelo para Pasada 2 (Drive search)

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type EnrichResult = {
  enriched: number;
  skipped: number;
  errors: number;
};

interface DocContent {
  transcript: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: Record<string, any> | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── HELPERS DE GOOGLE DOCS ────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

interface DocTab {
  tabProperties?: { title?: string | null };
  documentTab?: {
    body?: {
      content?: Array<{
        paragraph?: { elements?: Array<{ textRun?: { content?: string | null } }> };
      }>;
    };
  };
}

function extractTabText(tab: DocTab): string {
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

/** Lee un Google Doc por ID e intenta extraer transcript + resumen. */
async function fetchDocContent(
  userEmail: string,
  docId: string
): Promise<DocContent> {
  try {
    const auth = getImpersonatedAuth(userEmail);

    // Usamos auth.request() en vez del cliente docs.documents.get() para garantizar
    // que el parámetro includeTabsContent=true llega al servidor.
    // El cliente googleapis puede filtrar silenciosamente parámetros que no están
    // en sus tipos generados, pero auth.request() construye la URL directamente.
    const res = await auth.request<{
      tabs?: DocTab[];
      body?: {
        content?: Array<{
          paragraph?: { elements?: Array<{ textRun?: { content?: string | null } }> };
        }>;
      };
    }>({
      url: `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}?includeTabsContent=true`,
      method: "GET",
    });
    const doc = res.data;

    const rawTabs = (doc as unknown as { tabs?: DocTab[] }).tabs;

    if (rawTabs && rawTabs.length > 0) {
      // Log de diagnóstico — ayuda a detectar cuando los tab names no coinciden
      const tabNames = rawTabs.map((t) => t.tabProperties?.title ?? "(sin título)");
      console.log(`[google/enrich] Tabs encontrados en doc ${docId}: [${tabNames.join(", ")}]`);

      const transcriptTab = findTabByKeyword(rawTabs, "transcripci", "transcript");
      const notesTab     = findTabByKeyword(rawTabs, "notas", "gemini", "notes", "summary");

      if (transcriptTab || notesTab) {
        // Doc de Gemini Notes con tabs nombradas (caso habitual en Google Meet)
        const transcript = transcriptTab
          ? extractTabText(transcriptTab).slice(0, MAX_TRANSCRIPT_CHARS) || null
          : null;

        const notesText = notesTab ? extractTabText(notesTab) : null;
        const summary   = notesText ? { overview: notesText.slice(0, MAX_NOTES_CHARS) } : null;

        console.log(`[google/enrich] Doc ${docId}: transcript tab="${transcriptTab?.tabProperties?.title ?? "—"}" (${transcript?.length ?? 0} chars), notes tab="${notesTab?.tabProperties?.title ?? "—"}"`);
        return { transcript, summary };
      }

      // Tabs sin nombre reconocible → unir todo el contenido como transcript
      console.log(`[google/enrich] Doc ${docId}: ningún tab matcheó keywords — leyendo todo como transcript`);
      const allText = rawTabs
        .map(extractTabText)
        .filter(Boolean)
        .join("\n\n")
        .trim();
      return { transcript: allText.slice(0, MAX_TRANSCRIPT_CHARS) || null, summary: null };
    }

    console.log(`[google/enrich] Doc ${docId}: sin tabs — leyendo body completo`);

    // Sin tabs: leer body completo (fallback para docs sin tabs o si la API no devolvió tabs)
    const bodyText = (doc.body?.content ?? [])
      .flatMap((b) => b.paragraph?.elements ?? [])
      .map((el) => el.textRun?.content ?? "")
      .join("")
      .trim()
      .slice(0, MAX_TRANSCRIPT_CHARS);

    return { transcript: bodyText || null, summary: null };
  } catch {
    return { transcript: null, summary: null };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ── BÚSQUEDA EN GOOGLE DRIVE ──────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Extrae 2-3 keywords del título de la reunión para buscar en Drive. */
function titleKeywords(title: string): string[] {
  return title
    .replace(/[^\w\sáéíóúüñÁÉÍÓÚÜÑ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 3);
}

/**
 * Lee el contenido de un archivo de Drive.
 * Soporta: Google Docs (via Docs API) y VTT / texto plano (via export).
 */
async function readDriveFile(
  userEmail: string,
  fileId: string,
  mimeType: string
): Promise<string | null> {
  try {
    const auth = getImpersonatedAuth(userEmail);

    if (mimeType === "application/vnd.google-apps.document") {
      return (await fetchDocContent(userEmail, fileId)).transcript;
    }

    // VTT, texto plano u otros → exportar como texto
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" }
    );
    const text = (res.data as string).trim().slice(0, MAX_TRANSCRIPT_CHARS);
    return text || null;
  } catch {
    return null;
  }
}

/**
 * Busca en Drive del organizador transcripts o notas relacionadas con la reunión.
 * Ventana: ±DRIVE_SEARCH_WINDOW_DAYS días alrededor de la fecha.
 */
async function searchDriveForTranscript(
  organizerEmail: string,
  title: string,
  date: Date
): Promise<DocContent | null> {
  try {
    const auth = getImpersonatedAuth(organizerEmail);
    const drive = google.drive({ version: "v3", auth });

    const windowStart = new Date(date);
    windowStart.setDate(windowStart.getDate() - DRIVE_SEARCH_WINDOW_DAYS);
    const windowEnd = new Date(date);
    windowEnd.setDate(windowEnd.getDate() + DRIVE_SEARCH_WINDOW_DAYS);

    const keywords = titleKeywords(title);
    if (keywords.length === 0) return null;

    // Buscar Google Docs y VTT en la ventana temporal con keywords del título.
    // Usamos una cláusula "name contains" POR KEYWORD separada con "and", en lugar de
    // buscar la cadena completa. Esto evita que el pipe | u otros caracteres especiales
    // del título rompan el match (ej: "Visita Kolbi | Ventas" → keywords: Visita, Kolbi).
    const nameClause = keywords
      .slice(0, 2)  // máximo 2 para no ser demasiado restrictivo
      .map((k) => `name contains '${k.replace(/'/g, "\\'")}'`)
      .join(" and ");

    const query = [
      `(mimeType='application/vnd.google-apps.document' or mimeType='text/vtt' or mimeType='text/plain')`,
      `and (${nameClause})`,
      `and modifiedTime >= '${windowStart.toISOString()}'`,
      `and modifiedTime <= '${windowEnd.toISOString()}'`,
      `and trashed = false`,
    ].join(" ");

    console.log(`[google/enrich] Drive query para "${title}": ${query}`);

    const res = await drive.files.list({
      q: query,
      fields: "files(id, name, mimeType, createdTime)",
      pageSize: 5,
      orderBy: "createdTime desc",
    });

    const files = res.data.files ?? [];
    if (files.length === 0) {
      console.log(`[google/enrich] Drive: 0 archivos encontrados para "${title}" (keywords: ${keywords.join(", ")})`);
      return null;
    }

    console.log(`[google/enrich] Drive: encontrados ${files.length} archivos para "${title}": ${files.map((f) => f.name).join(", ")}`);

    for (const file of files) {
      if (!file.id || !file.mimeType) continue;
      const text = await readDriveFile(organizerEmail, file.id, file.mimeType);
      if (text && text.length > 100) {
        console.log(`[google/enrich] Drive: leyendo "${file.name}" para "${title}"`);
        return { transcript: text, summary: null };
      }
    }

    return null;
  } catch (err) {
    console.log(
      `[google/enrich] Error buscando en Drive para "${title}":`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ── FUNCIÓN PRINCIPAL ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enriquece sesiones de Google Meet en dos pasadas:
 *
 * Pasada 1: sesiones con googleDocId adjunto (Gemini Notes del evento de Calendar).
 * Pasada 2: sesiones sin googleDocId — busca en Google Drive del organizador.
 *
 * Una sesión se marca como enrichedAt independientemente de si se encontró
 * contenido, para evitar reintentos infinitos.
 */
export async function enrichGoogleMeetSessions(): Promise<EnrichResult> {
  let enriched = 0;
  let skipped = 0;
  let errors = 0;

  // ── PASADA 1: Sesiones con Google Doc adjunto ────────────────────────────────
  const withDoc = await prisma.firefliesSession.findMany({
    where: {
      source: "google_meet",
      enrichedAt: null,
      googleDocId: { not: null },
      organizerEmail: { not: null },
    },
    select: { id: true, title: true, googleDocId: true, organizerEmail: true },
  });

  console.log(`[google/enrich] Pasada 1: ${withDoc.length} sesiones con doc adjunto (batches de ${DOC_BATCH})`);

  for (let i = 0; i < withDoc.length; i += DOC_BATCH) {
    const batch = withDoc.slice(i, i + DOC_BATCH);
    await Promise.all(
      batch.map(async (s) => {
        try {
          const content = await fetchDocContent(s.organizerEmail!, s.googleDocId!);

          // Si hay transcript pero no hay resumen del doc, generar con AI
          let finalSummary = content.summary;
          if (content.transcript && !finalSummary) {
            console.log(`[google/enrich] Generando resumen AI para "${s.title}"…`);
            finalSummary = await summarizeTranscript(s.title, content.transcript);
          }

          if (!content.transcript && !finalSummary) {
            skipped++;
          } else {
            enriched++;
            console.log(`[google/enrich] ✓ Doc adjunto: "${s.title}" (resumen: ${finalSummary ? "AI" : "doc"})`);
          }

          await prisma.firefliesSession.update({
            where: { id: s.id },
            data: {
              transcript: content.transcript ?? undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              summary: (finalSummary ?? undefined) as any,
              enrichedAt: new Date(),
            },
          });
        } catch (err) {
          console.log(`[google/enrich] Error sesión ${s.id}:`, err instanceof Error ? err.message : err);
          errors++;
        }
      })
    );
  }

  // ── PASADA 2: Sesiones sin doc adjunto → buscar en Drive ─────────────────────
  const withoutDoc = await prisma.firefliesSession.findMany({
    where: {
      source: "google_meet",
      enrichedAt: null,
      googleDocId: null,
      organizerEmail: { not: null },
    },
    select: { id: true, title: true, date: true, organizerEmail: true },
    orderBy: { date: "desc" },
  });

  console.log(`[google/enrich] Pasada 2: ${withoutDoc.length} sesiones sin doc — buscando en Drive`);

  // Procesar en batches para no saturar la API
  for (let i = 0; i < withoutDoc.length; i += DRIVE_BATCH) {
    const batch = withoutDoc.slice(i, i + DRIVE_BATCH);

    await Promise.all(
      batch.map(async (s) => {
        try {
          const content = await searchDriveForTranscript(
            s.organizerEmail!,
            s.title,
            s.date
          );

          // Fase 2 nunca trae summary — generarlo con AI si hay transcript
          let finalSummary = content?.summary ?? null;
          if (content?.transcript && !finalSummary) {
            console.log(`[google/enrich] Generando resumen AI (Drive) para "${s.title}"…`);
            finalSummary = await summarizeTranscript(s.title, content.transcript);
          }

          if (content?.transcript || finalSummary) {
            enriched++;
            console.log(`[google/enrich] ✓ Drive: "${s.title}"`);
          } else {
            skipped++;
          }

          await prisma.firefliesSession.update({
            where: { id: s.id },
            data: {
              transcript: content?.transcript ?? undefined,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              summary: (finalSummary ?? undefined) as any,
              enrichedAt: new Date(),
            },
          });
        } catch (err) {
          console.log(`[google/enrich] Error sesión ${s.id}:`, err instanceof Error ? err.message : err);
          errors++;
        }
      })
    );
  }

  console.log(
    `[google/enrich] Completado: ${enriched} con contenido, ${skipped} sin contenido, ${errors} errores`
  );
  return { enriched, skipped, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── ENRIQUECIMIENTO DE SESIÓN INDIVIDUAL ─────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-enriquece una sola sesión por ID.
 * Resetea enrichedAt y vuelve a leer el Google Doc / Drive.
 * Retorna true si se encontró contenido.
 */
export async function enrichSingleSession(sessionId: string): Promise<boolean> {
  const session = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true, title: true, date: true,
      googleDocId: true, organizerEmail: true, source: true,
    },
  });
  if (!session) return false;

  let content: DocContent = { transcript: null, summary: null };

  if (session.googleDocId && session.organizerEmail) {
    content = await fetchDocContent(session.organizerEmail, session.googleDocId);
  } else if (session.organizerEmail) {
    const driveContent = await searchDriveForTranscript(
      session.organizerEmail, session.title, session.date
    );
    content = driveContent ?? { transcript: null, summary: null };
  }

  // Si hay transcript pero no summary, generar con AI
  let finalSummary = content.summary;
  if (content.transcript && !finalSummary) {
    console.log(`[google/enrich] Generando resumen AI para sesión individual "${session.title}"…`);
    finalSummary = await summarizeTranscript(session.title, content.transcript);
  }

  await prisma.firefliesSession.update({
    where: { id: sessionId },
    data: {
      transcript: content.transcript ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      summary: (finalSummary ?? undefined) as any,
      enrichedAt: new Date(),
    },
  });

  const found = !!(content.transcript || finalSummary);
  console.log(`[google/enrich] Sesión individual "${session.title}": ${found ? "✓ contenido encontrado" : "sin contenido"}`);
  return found;
}
