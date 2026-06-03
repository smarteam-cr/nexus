/**
 * POST /api/projects/[projectId]/documents/link
 *
 * Agrega un documento del cliente a partir de un enlace de Google Drive
 * (Docs/Slides/Sheets o un archivo binario en Drive). Extrae el texto
 * automáticamente impersonando al usuario logueado y lo guarda como
 * ClientDocument tipo URL con `content` — que el agente Handoff (y otros)
 * consumen sin pasos extra.
 *
 * Endpoint INTERNO (guardAccessToProject). El cliente externo nunca lo toca.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import {
  parseGoogleDriveUrl,
  extractGoogleDriveFile,
  DriveFileError,
} from "@/lib/google/drive-files";
import { fetchWebPage, WebFetchError } from "@/lib/documents/fetch-web-page";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "Falta la URL" }, { status: 400 });
  }

  // Resultado de la extracción: título + mimeType + contenido.
  let title: string;
  let mimeType: string;
  let content: string | null;

  const parsed = parseGoogleDriveUrl(url);

  if (parsed) {
    // ── Caso 1: archivo de Google Drive (Docs/Slides/Sheets/binario) ──────────
    // Impersonar al usuario logueado para acceder a Drive (menor privilegio).
    try {
      const extracted = await extractGoogleDriveFile(guard.user.email, parsed.fileId);
      title = extracted.title;
      mimeType = extracted.mimeType;
      content = extracted.content;
    } catch (err) {
      if (err instanceof DriveFileError) {
        const statusMap: Record<DriveFileError["code"], number> = {
          NO_ACCESS: 403, NOT_FOUND: 404, TOO_LARGE: 413, UNSUPPORTED: 422,
        };
        const messageMap: Record<DriveFileError["code"], string> = {
          NO_ACCESS: "No tenés acceso a ese archivo. Pedí que lo compartan con vos o con el equipo.",
          NOT_FOUND: "El archivo no existe o fue eliminado de Drive.",
          TOO_LARGE: "El archivo es demasiado grande para leer automáticamente.",
          UNSUPPORTED: "Ese tipo de archivo de Google no se puede leer como texto (ej. Forms, Drawings).",
        };
        return NextResponse.json({ error: messageMap[err.code] }, { status: statusMap[err.code] });
      }
      console.error("[documents/link] Drive error inesperado:", err);
      return NextResponse.json(
        { error: "No se pudo leer el archivo de Drive. Probá de nuevo en unos segundos." },
        { status: 500 },
      );
    }
  } else if (/^https?:\/\//i.test(url)) {
    // ── Caso 2: página web pública (propuesta comercial como URL) ─────────────
    try {
      const page = await fetchWebPage(url);
      title = page.title;
      mimeType = "text/html";
      content = page.content;
    } catch (err) {
      if (err instanceof WebFetchError) {
        const statusMap: Record<WebFetchError["code"], number> = {
          INVALID_URL: 400, BLOCKED: 400, FETCH_FAILED: 502, TOO_LARGE: 413, EMPTY: 422,
        };
        return NextResponse.json({ error: err.message }, { status: statusMap[err.code] });
      }
      console.error("[documents/link] Web fetch error inesperado:", err);
      return NextResponse.json(
        { error: "No se pudo leer la página. Probá de nuevo en unos segundos." },
        { status: 500 },
      );
    }
  } else {
    return NextResponse.json(
      { error: "URL no reconocida. Pegá un link de Google (Docs/Slides/Sheets/Drive) o una página web (http/https)." },
      { status: 400 },
    );
  }

  // Persistir como ClientDocument tipo URL. Dedup por (projectId, url): si ya
  // existe un documento con esta URL en este proyecto, ACTUALIZARLO (re-lee el
  // contenido — útil para refrescar un Google Doc que cambió) en vez de crear
  // un duplicado. ClientDocument no tiene unique (projectId,url), así que
  // hacemos find-then-update/create.
  const existing = await prisma.clientDocument.findFirst({
    where: { projectId, url, type: "URL" },
    select: { id: true },
  });

  const doc = existing
    ? await prisma.clientDocument.update({
        where: { id: existing.id },
        data: { title, mimeType, content },
      })
    : await prisma.clientDocument.create({
        data: {
          clientId: guard.clientId,
          projectId,
          title,
          type: "URL",
          url,
          mimeType,
          content,
        },
      });

  return NextResponse.json({
    id: doc.id,
    title: doc.title,
    type: doc.type,
    url: doc.url,
    mimeType: doc.mimeType,
    hasContent: !!doc.content,
    updated: !!existing, // true si se refrescó un doc existente
    createdAt: doc.createdAt.toISOString(),
  });
}
