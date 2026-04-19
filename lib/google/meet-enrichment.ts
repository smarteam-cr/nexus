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

// ── Constantes ────────────────────────────────────────────────────────────────

const MAX_TRANSCRIPT_CHARS = 8_000;
const DRIVE_SEARCH_WINDOW_DAYS = 2;   // buscar ±2 días alrededor de la reunión
const DRIVE_BATCH = 5;                // sesiones en paralelo para búsqueda en Drive

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type EnrichResult = {
  enriched: number;
  skipped: number;
  errors: number;
};

interface DocContent {
  transcript: string | null;
  summary: Record<string, string> | null;
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
    const docs = google.docs({ version: "v1", auth });
    const res = await docs.documents.get({ documentId: docId });
    const doc = res.data;

    const rawTabs = (doc as unknown as { tabs?: DocTab[] }).tabs;

    if (rawTabs && rawTabs.length > 0) {
      const transcriptTab = findTabByKeyword(rawTabs, "transcripci", "transcript");
      const notesTab = findTabByKeyword(rawTabs, "notas", "gemini", "notes", "summary");

      const transcript = transcriptTab
        ? extractTabText(transcriptTab).slice(0, MAX_TRANSCRIPT_CHARS) || null
        : null;

      const notesText = notesTab ? extractTabText(notesTab) : null;
      const summary = notesText ? { overview: notesText.slice(0, 4_000) } : null;

      return { transcript, summary };
    }

    // Sin tabs: leer body completo
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
function titleKeywords(title: string): string {
  return title
    .replace(/[^\w\sáéíóúüñÁÉÍÓÚÜÑ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 3)
    .join(" ");
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
    if (!keywords) return null;

    // Buscar Google Docs y VTT en la ventana temporal con keywords del título
    const query = [
      `(mimeType='application/vnd.google-apps.document' or mimeType='text/vtt' or mimeType='text/plain')`,
      `and name contains '${keywords.replace(/'/g, "\\'")}'`,
      `and modifiedTime >= '${windowStart.toISOString()}'`,
      `and modifiedTime <= '${windowEnd.toISOString()}'`,
      `and trashed = false`,
    ].join(" ");

    const res = await drive.files.list({
      q: query,
      fields: "files(id, name, mimeType, createdTime)",
      pageSize: 5,
      orderBy: "createdTime desc",
    });

    const files = res.data.files ?? [];
    if (files.length === 0) return null;

    console.log(`[google/enrich] Drive: encontrados ${files.length} archivos para "${title}"`);

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

  console.log(`[google/enrich] Pasada 1: ${withDoc.length} sesiones con doc adjunto`);

  for (const s of withDoc) {
    try {
      const content = await fetchDocContent(s.organizerEmail!, s.googleDocId!);

      if (!content.transcript && !content.summary) {
        skipped++;
      } else {
        enriched++;
        console.log(`[google/enrich] ✓ Doc adjunto: "${s.title}"`);
      }

      await prisma.firefliesSession.update({
        where: { id: s.id },
        data: {
          transcript: content.transcript ?? undefined,
          summary: content.summary ?? undefined,
          enrichedAt: new Date(),
        },
      });
    } catch (err) {
      console.log(`[google/enrich] Error sesión ${s.id}:`, err instanceof Error ? err.message : err);
      errors++;
    }
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

          if (content?.transcript || content?.summary) {
            enriched++;
            console.log(`[google/enrich] ✓ Drive: "${s.title}"`);
          } else {
            skipped++;
          }

          await prisma.firefliesSession.update({
            where: { id: s.id },
            data: {
              transcript: content?.transcript ?? undefined,
              summary: content?.summary ?? undefined,
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
