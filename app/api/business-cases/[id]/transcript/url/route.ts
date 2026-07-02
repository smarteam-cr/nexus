/**
 * POST /api/business-cases/[id]/transcript/url
 *   body: { url }                         → lee la página (server-side) y la guarda
 *   body: { transcriptId, refetch:true }  → re-lee una fuente URL existente
 *
 * Diagnóstico por URL como fuente de contexto: fetch server-side (SSRF-safe,
 * lib/documents/fetch-web-page) → fila en BusinessCaseTranscript reusando columnas
 * existentes (CERO cambios de schema, decisión dual-PC):
 *   source="PASTED" · rawText=texto extraído · fileName=título · fileUrl=la URL
 *   (los UPLOADED guardan paths de Storage, nunca http → `http%` discrimina) ·
 *   mimeType="text/html" · processedAt=último fetch.
 * El contenido queda CONGELADO al pegar (reproducible); "Releer" es manual.
 * Dedup por (businessCaseId, fileUrl): re-pegar la misma URL = refetch.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { fetchWebPage, WebFetchError } from "@/lib/documents/fetch-web-page";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({ where: { id }, select: { id: true } });
  if (!bc) return NextResponse.json({ error: "Business case no existe" }, { status: 404 });

  let body: { url?: unknown; transcriptId?: unknown; refetch?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Resolver la URL objetivo: directa, o desde una fila existente (refetch).
  let url = typeof body.url === "string" ? body.url.trim() : "";
  let existingId: string | null = null;

  if (!url && typeof body.transcriptId === "string" && body.refetch === true) {
    const row = await prisma.businessCaseTranscript.findFirst({
      where: { id: body.transcriptId, businessCaseId: id },
      select: { id: true, fileUrl: true },
    });
    if (!row?.fileUrl?.startsWith("http")) {
      return NextResponse.json({ error: "Esa fuente no es una URL." }, { status: 400 });
    }
    url = row.fileUrl;
    existingId = row.id;
  }

  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Pegá una URL http(s) válida." }, { status: 400 });
  }

  let title: string;
  let content: string;
  try {
    const page = await fetchWebPage(url);
    title = page.title ?? "";
    content = page.content ?? "";
    if (!content.trim()) {
      return NextResponse.json(
        { error: "La página no devolvió texto legible. Alternativa: copiá el texto de la página y pegalo como fuente manual." },
        { status: 422 },
      );
    }
  } catch (err) {
    if (err instanceof WebFetchError) {
      const statusMap: Record<WebFetchError["code"], number> = {
        INVALID_URL: 400, BLOCKED: 400, FETCH_FAILED: 502, TOO_LARGE: 413, EMPTY: 422,
      };
      const suffix =
        err.code === "EMPTY"
          ? " Alternativa: copiá el texto de la página y pegalo como fuente manual."
          : "";
      return NextResponse.json({ error: err.message + suffix }, { status: statusMap[err.code] });
    }
    console.error("[bc transcript/url] fetch error inesperado:", err);
    return NextResponse.json(
      { error: "No se pudo leer la página. Probá de nuevo en unos segundos." },
      { status: 500 },
    );
  }

  // Dedup por (businessCaseId, fileUrl) — sin unique en el schema: find-then-update
  // (mismo patrón que documents/link).
  if (!existingId) {
    const dup = await prisma.businessCaseTranscript.findFirst({
      where: { businessCaseId: id, fileUrl: url },
      select: { id: true },
    });
    existingId = dup?.id ?? null;
  }

  const data = {
    rawText: content,
    fileName: title || hostnameOf(url),
    mimeType: "text/html",
    processedAt: new Date(),
  };
  const row = existingId
    ? await prisma.businessCaseTranscript.update({ where: { id: existingId }, data })
    : await prisma.businessCaseTranscript.create({
        data: { businessCaseId: id, source: "PASTED", fileUrl: url, ...data },
      });

  return NextResponse.json(
    {
      transcript: {
        id: row.id,
        fileName: row.fileName,
        hostname: hostnameOf(url),
        chars: content.length,
        processedAt: row.processedAt?.toISOString() ?? null,
        updated: !!existingId,
      },
    },
    { status: existingId ? 200 : 201 },
  );
}
