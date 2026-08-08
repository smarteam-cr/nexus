/**
 * lib/google/meet-enrichment.ts
 *
 * Enriquecimiento de sesiones Google Meet en dos fases:
 *
 * FASE 1 — Doc adjunto (googleDocId en el evento del calendario):
 *   Lee el Google Doc (Gemini Notes). La POLÍTICA de parseo vive en doc-parse.ts (pura).
 *
 * FASE 2 — Búsqueda en Drive (sesiones sin doc adjunto):
 *   Busca en Drive del impersonado archivos creados ±3 días del meet (VTT / Docs).
 *
 * ── LAS TRES REGLAS QUE ESTE ARCHIVO APRENDIÓ A GOLPES (2026-08-08) ──────────
 * 1. **Un fallo de lectura NUNCA sella.** Antes, un 429 de la API se tragaba en un catch
 *    mudo y la fila quedaba `enrichedAt` para siempre: así se quemaron las corridas del
 *    17-may (528/1100 docs ilegibles) y del 7-jul (47/73). Ahora el resultado es
 *    DISCRIMINADO (`LecturaDoc`) y la escritura la decide `datosDeEscritura` (pura):
 *    fallo → attempts+1 con el error persistido, sin sellar; lo drena el job
 *    `google-enrich-retry` con espera exponencial; al 5º fallo se sella CON procedencia.
 * 2. **Se impersona a quien se PUEDE impersonar.** Antes siempre al organizador; si era el
 *    cliente o una sala, la lectura era imposible por diseño (~267 reuniones al 7%).
 *    `elegirImpersonado` (puro) cae al primer participante interno.
 * 3. **No se enriquece lo que no ocurrió.** Antes las pasadas tomaban sesiones futuras y
 *    las sellaban vacías (88/171 de Desarrollo selladas ANTES de la reunión). Ahora el
 *    where exige `date < ahora - 1h`.
 */

import { google } from "googleapis";
import { prisma } from "@/lib/db/prisma";
import { getImpersonatedAuth } from "@/lib/google/auth";
import { summarizeTranscript } from "@/lib/ai/summarize-session";
import { parseDocTabs, parseDocBody, MAX_TRANSCRIPT_CHARS, MIN_TRANSCRIPT_CHARS, type DocTab } from "./doc-parse";
import { elegirImpersonado } from "./elegir-impersonado";
import {
  datosDeEscritura,
  esReintentable,
  esperaBackoffMs,
  esErrorDeCuota,
  MAX_ENRICH_ATTEMPTS,
  type LecturaDoc,
} from "./enrich-retry";

// ── Constantes ────────────────────────────────────────────────────────────────

const DRIVE_SEARCH_WINDOW_DAYS = 3; // buscar ±3 días alrededor de la reunión
/* 10 → 3 (2026-08-08): con 10 en paralelo y sin backoff, una API que ya devolvía cuota
   recibía 10 pedidos más por batch — es la mecánica exacta de la quema del 17-may. */
const DOC_BATCH = 3;
const DRIVE_BATCH = 3;
/** No enriquecer reuniones que todavía no ocurrieron (o están ocurriendo). */
const GRACIA_MS = 3_600_000;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type EnrichResult = {
  enriched: number;
  skipped: number;
  errors: number;
};

/** Lo mínimo de una fila para procesarla. */
interface SesionAEnriquecer {
  id: string;
  title: string;
  date: Date;
  googleDocId: string | null;
  organizerEmail: string | null;
  participants: string[];
  enrichAttempts: number;
}

const SELECT_ENRIQUECER = {
  id: true,
  title: true,
  date: true,
  googleDocId: true,
  organizerEmail: true,
  participants: true,
  enrichAttempts: true,
} as const;

/** El status HTTP de un error de googleapis, si lo trae. */
function statusDe(err: unknown): number | null {
  const e = err as { response?: { status?: number }; status?: number; code?: number | string };
  const s = e?.response?.status ?? e?.status ?? (typeof e?.code === "number" ? e.code : null);
  return typeof s === "number" ? s : null;
}

function mensajeDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LECTURA DE GOOGLE DOCS ────────────────────────────────────────────────────
// La POLÍTICA de parseo (qué pestaña es el transcript, cuándo se promueve otra por
// contenido, qué cuenta como plantilla vacía) vive en lib/google/doc-parse.ts — pura y
// testeada como tabla. Acá queda SOLO el fetch.
// ─────────────────────────────────────────────────────────────────────────────

/** Lee un Google Doc por ID e intenta extraer transcript + resumen. */
async function fetchDocContent(userEmail: string, docId: string): Promise<LecturaDoc> {
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
      const parsed = parseDocTabs(rawTabs);
      console.log(
        `[google/enrich] Doc ${docId}: tabs [${parsed.diagnostico.tabsVistos.join(", ")}] → ` +
          `${parsed.diagnostico.motivo} (transcript ${parsed.transcript?.length ?? 0} chars)`,
      );
      return { ok: true, transcript: parsed.transcript, summary: parsed.summary, diagnostico: parsed.diagnostico };
    }

    // Sin tabs: leer body completo (fallback para docs sin tabs o si la API no devolvió tabs)
    const bodyText = (doc.body?.content ?? [])
      .flatMap((b) => b.paragraph?.elements ?? [])
      .map((el) => el.textRun?.content ?? "")
      .join("")
      .trim();
    const parsed = parseDocBody(bodyText);
    console.log(`[google/enrich] Doc ${docId}: sin tabs → ${parsed.diagnostico.motivo}`);
    return { ok: true, transcript: parsed.transcript, summary: parsed.summary, diagnostico: parsed.diagnostico };
  } catch (err) {
    /* ⚠ EL FALLO SE PROPAGA, NO SE DISFRAZA DE "SIN CONTENIDO". Este catch devolvía
       {transcript:null, summary:null} y el escritor sellaba la fila: un 429 pasajero quedaba
       grabado como «esta reunión no tiene nada» para siempre. */
    return { ok: false, error: mensajeDe(err), status: statusDe(err) };
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
  mimeType: string,
): Promise<{ ok: true; text: string | null } | { ok: false; error: string; status: number | null }> {
  try {
    const auth = getImpersonatedAuth(userEmail);

    if (mimeType === "application/vnd.google-apps.document") {
      const doc = await fetchDocContent(userEmail, fileId);
      if (!doc.ok) return doc;
      return { ok: true, text: doc.transcript };
    }

    // VTT, texto plano u otros → exportar como texto
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" },
    );
    const text = (res.data as string).trim().slice(0, MAX_TRANSCRIPT_CHARS);
    return { ok: true, text: text || null };
  } catch (err) {
    return { ok: false, error: mensajeDe(err), status: statusDe(err) };
  }
}

/**
 * Busca en Drive del impersonado transcripts o notas relacionadas con la reunión.
 * Ventana: ±DRIVE_SEARCH_WINDOW_DAYS días alrededor de la fecha.
 */
async function searchDriveForTranscript(
  userEmail: string,
  title: string,
  date: Date,
): Promise<LecturaDoc> {
  const sinResultados = (motivo: string): LecturaDoc => ({
    ok: true,
    transcript: null,
    summary: null,
    diagnostico: { tabsVistos: [], motivo },
  });
  try {
    const auth = getImpersonatedAuth(userEmail);
    const drive = google.drive({ version: "v3", auth });

    const windowStart = new Date(date);
    windowStart.setDate(windowStart.getDate() - DRIVE_SEARCH_WINDOW_DAYS);
    const windowEnd = new Date(date);
    windowEnd.setDate(windowEnd.getDate() + DRIVE_SEARCH_WINDOW_DAYS);

    const keywords = titleKeywords(title);
    if (keywords.length === 0) return sinResultados("drive_sin_keywords");

    // Buscar Google Docs y VTT en la ventana temporal con keywords del título.
    // Usamos una cláusula "name contains" POR KEYWORD separada con "and", en lugar de
    // buscar la cadena completa. Esto evita que el pipe | u otros caracteres especiales
    // del título rompan el match (ej: "Visita Kolbi | Ventas" → keywords: Visita, Kolbi).
    const nameClause = keywords
      .slice(0, 2) // máximo 2 para no ser demasiado restrictivo
      .map((k) => `name contains '${k.replace(/'/g, "\\'")}'`)
      .join(" and ");

    const query = [
      `(mimeType='application/vnd.google-apps.document' or mimeType='text/vtt' or mimeType='text/plain')`,
      `and (${nameClause})`,
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
    if (files.length === 0) {
      console.log(`[google/enrich] Drive: 0 archivos para "${title}" (keywords: ${keywords.join(", ")})`);
      return sinResultados("drive_sin_resultados");
    }

    console.log(`[google/enrich] Drive: ${files.length} archivos para "${title}": ${files.map((f) => f.name).join(", ")}`);

    let fallo: { error: string; status: number | null } | null = null;
    for (const file of files) {
      if (!file.id || !file.mimeType) continue;
      const leido = await readDriveFile(userEmail, file.id, file.mimeType);
      if (!leido.ok) {
        // Un archivo ilegible no corta la búsqueda, pero si NINGUNO se pudo leer, el
        // resultado es un FALLO (reintentable), no un «sin contenido» definitivo.
        fallo = leido;
        continue;
      }
      if (leido.text && leido.text.length > 100) {
        console.log(`[google/enrich] Drive: leyendo "${file.name}" para "${title}"`);
        return { ok: true, transcript: leido.text, summary: null, diagnostico: null };
      }
    }

    if (fallo) return { ok: false, ...fallo };
    return sinResultados("drive_sin_contenido_util");
  } catch (err) {
    return { ok: false, error: mensajeDe(err), status: statusDe(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL NÚCLEO: leer una sesión y escribir el resultado ───────────────────────
// Un solo camino para las dos pasadas, el reintento y el re-enrich individual —
// tener TRES escritores fue lo que dejó divergir el sellado en primer lugar.
// ─────────────────────────────────────────────────────────────────────────────

async function leerSesion(s: SesionAEnriquecer): Promise<LecturaDoc> {
  const impersonado = elegirImpersonado(s.organizerEmail, s.participants);
  if (!impersonado) {
    // Reunión 100% externa: no hay cuenta nuestra con la que leer. Es un fallo CON
    // procedencia (con el tope se sella solo), no un «sin contenido».
    return { ok: false, error: "sin_interno_para_impersonar", status: null };
  }
  if (s.googleDocId) return fetchDocContent(impersonado, s.googleDocId);
  return searchDriveForTranscript(impersonado, s.title, s.date);
}

type EstadoProceso = { estado: "enriched" | "skipped" | "error"; status: number | null };

async function procesarSesion(s: SesionAEnriquecer): Promise<EstadoProceso> {
  const lectura = await leerSesion(s);

  if (!lectura.ok) {
    await prisma.firefliesSession.update({
      where: { id: s.id },
      data: datosDeEscritura(lectura, null, s.enrichAttempts, new Date()),
    });
    console.log(
      `[google/enrich] ✗ "${s.title}": ${lectura.error} (status ${lectura.status ?? "—"}, intento ${s.enrichAttempts + 1}/${MAX_ENRICH_ATTEMPTS})`,
    );
    return { estado: "error", status: lectura.status };
  }

  // Si hay transcript pero no resumen del doc, generarlo con AI. Si la AI falla, el
  // transcript NO se pierde: se escribe igual y el resumen queda para otra corrida.
  let finalSummary = lectura.summary;
  if (lectura.transcript && !finalSummary) {
    try {
      finalSummary = (await summarizeTranscript(s.title, lectura.transcript)) as typeof finalSummary;
    } catch (err) {
      console.log(`[google/enrich] resumen AI falló para "${s.title}":`, mensajeDe(err));
    }
  }

  await prisma.firefliesSession.update({
    where: { id: s.id },
    data: datosDeEscritura(lectura, finalSummary ?? null, s.enrichAttempts, new Date()),
  });

  // Auto-trigger del Análisis post-sesión: con transcript real, generar minuta DRAFT +
  // acciones en background. Idempotente (no reemplaza si ya existe minuta).
  if (lectura.transcript && lectura.transcript.trim().length >= MIN_TRANSCRIPT_CHARS) {
    const { postProcessSession } = await import("@/lib/sessions/post-process");
    postProcessSession(s.id).catch((err) => {
      console.log(`[google/enrich] post-process falló para ${s.id}:`, mensajeDe(err));
    });
  }

  if (lectura.transcript || finalSummary) {
    console.log(`[google/enrich] ✓ "${s.title}" (${lectura.transcript ? "transcript" : "solo resumen"})`);
    return { estado: "enriched", status: null };
  }
  return { estado: "skipped", status: null };
}

/** Corre un lote con backoff: tras un batch con 429/5xx, duerme antes del siguiente. */
async function correrLote(sesiones: SesionAEnriquecer[], batchSize: number, resultado: EnrichResult) {
  let fallosDeCuota = 0;
  for (let i = 0; i < sesiones.length; i += batchSize) {
    const batch = sesiones.slice(i, i + batchSize);
    const estados = await Promise.all(
      batch.map(async (s) => {
        try {
          return await procesarSesion(s);
        } catch (err) {
          // Red de seguridad: una excepción fuera de la lectura (p.ej. la base) no
          // toca la fila — queda pendiente para la próxima pasada.
          console.log(`[google/enrich] Error sesión ${s.id}:`, mensajeDe(err));
          return { estado: "error", status: null } as EstadoProceso;
        }
      }),
    );
    for (const e of estados) {
      if (e.estado === "enriched") resultado.enriched++;
      else if (e.estado === "skipped") resultado.skipped++;
      else resultado.errors++;
    }
    if (estados.some((e) => esErrorDeCuota(e.status))) {
      fallosDeCuota++;
      const espera = esperaBackoffMs(fallosDeCuota);
      console.log(`[google/enrich] cuota/5xx en el batch — backoff ${espera}ms`);
      await new Promise((r) => setTimeout(r, espera));
    } else {
      fallosDeCuota = 0;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ── FUNCIÓN PRINCIPAL ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enriquece sesiones de Google Meet en dos pasadas:
 *
 * Pasada 1: sesiones con googleDocId adjunto (Gemini Notes del evento de Calendar).
 * Pasada 2: sesiones sin googleDocId — busca en Google Drive del impersonado.
 *
 * Solo toma filas SANAS (`enrichAttempts: 0`) y de reuniones que YA ocurrieron. Lo
 * fallido lo drena `drenarReintentos` con espera exponencial.
 */
export async function enrichGoogleMeetSessions(): Promise<EnrichResult> {
  const resultado: EnrichResult = { enriched: 0, skipped: 0, errors: 0 };
  const yaOcurrio = new Date(Date.now() - GRACIA_MS);

  // ── PASADA 1: Sesiones con Google Doc adjunto ────────────────────────────────
  const withDoc = await prisma.firefliesSession.findMany({
    where: {
      source: "google_meet",
      enrichedAt: null,
      enrichAttempts: 0,
      googleDocId: { not: null },
      date: { lt: yaOcurrio },
    },
    select: SELECT_ENRIQUECER,
  });

  console.log(`[google/enrich] Pasada 1: ${withDoc.length} sesiones con doc adjunto (batches de ${DOC_BATCH})`);
  await correrLote(withDoc, DOC_BATCH, resultado);

  // ── PASADA 2: Sesiones sin doc adjunto → buscar en Drive ─────────────────────
  const withoutDoc = await prisma.firefliesSession.findMany({
    where: {
      source: "google_meet",
      enrichedAt: null,
      enrichAttempts: 0,
      googleDocId: null,
      date: { lt: yaOcurrio },
    },
    select: SELECT_ENRIQUECER,
    orderBy: { date: "desc" },
  });

  console.log(`[google/enrich] Pasada 2: ${withoutDoc.length} sesiones sin doc — buscando en Drive`);
  await correrLote(withoutDoc, DRIVE_BATCH, resultado);

  console.log(
    `[google/enrich] Completado: ${resultado.enriched} con contenido, ${resultado.skipped} sin contenido, ${resultado.errors} errores`,
  );
  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL DRENAJE DE LO FALLIDO ─────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reintenta sesiones FALLIDAS (attempts 1..4) cuya espera exponencial ya venció.
 * Lo llama el job `google-enrich-retry`. Con tope por tick para no competir con las
 * pasadas normales; al 5º fallo `datosDeEscritura` sella con procedencia.
 */
export async function drenarReintentos(limit = 20): Promise<EnrichResult> {
  const resultado: EnrichResult = { enriched: 0, skipped: 0, errors: 0 };
  const ahora = new Date();

  const candidatas = await prisma.firefliesSession.findMany({
    where: {
      source: "google_meet",
      enrichedAt: null,
      enrichAttempts: { gte: 1, lt: MAX_ENRICH_ATTEMPTS },
      date: { lt: new Date(ahora.getTime() - GRACIA_MS) },
    },
    select: { ...SELECT_ENRIQUECER, enrichError: true },
    orderBy: { date: "desc" },
    take: limit * 3,
  });

  const listas = candidatas
    .filter((c) => esReintentable(c.enrichAttempts, c.enrichError, ahora))
    .slice(0, limit);
  if (listas.length === 0) return resultado;

  console.log(`[google/enrich] Reintentos: ${listas.length} de ${candidatas.length} candidatas`);
  await correrLote(listas, DOC_BATCH, resultado);
  return resultado;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── ENRIQUECIMIENTO DE SESIÓN INDIVIDUAL ─────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-enriquece una sola sesión por ID (el botón manual). Vuelve a leer el material con
 * el MISMO núcleo que las pasadas — un fallo tampoco sella acá: queda con su error y
 * su intento anotados, visible en `enrichError`.
 * Retorna true si se encontró contenido.
 */
export async function enrichSingleSession(sessionId: string): Promise<boolean> {
  const session = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: SELECT_ENRIQUECER,
  });
  if (!session) return false;

  // El pedido manual arranca de cero: es la persona diciendo «intentá de nuevo YA».
  const r = await procesarSesion({ ...session, enrichAttempts: 0 });
  const found = r.estado === "enriched";
  console.log(`[google/enrich] Sesión individual "${session.title}": ${found ? "✓ contenido encontrado" : r.estado === "error" ? "✗ fallo la lectura" : "sin contenido"}`);
  return found;
}
