/**
 * /api/business-cases/[id]/transcript
 *   GET  → lista los transcripts del caso
 *   POST → adjunta un transcript:
 *           - JSON { source:"PASTED", rawText, fileName? } → texto pegado
 *           - multipart/form-data (file) → sube a Storage + extrae texto
 *
 * El transcript alimenta la generación. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import {
  getStorageClient,
  BUCKET_NAME,
  MAX_FILE_SIZE,
  ensureBucket,
} from "@/lib/storage/client";
import { extractText } from "@/lib/documents/extract-text";
import {
  addPastedTranscript,
  addUploadedTranscript,
  PastedTranscriptBody,
} from "@/lib/business-cases";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const transcripts = await prisma.businessCaseTranscript.findMany({
    where: { businessCaseId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      source: true,
      rawText: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      createdAt: true,
      // Fuente URL (transcript/url): la UI necesita distinguirla (fileUrl http) y
      // mostrar la fecha del último fetch. Aditivo — los consumidores viejos lo ignoran.
      fileUrl: true,
      processedAt: true,
    },
  });
  return NextResponse.json({ transcripts });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!bc) {
    return NextResponse.json({ error: "Business case no existe" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  // ── Archivo adjunto (multipart) → Storage + extracción ─────────────────────
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No se adjuntó archivo" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Archivo muy grande (máx ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 },
      );
    }
    const storage = getStorageClient();
    if (!storage) {
      return NextResponse.json(
        { error: "El almacenamiento de archivos no está configurado." },
        { status: 503 },
      );
    }
    await ensureBucket();

    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `business-cases/${id}/${Date.now()}_${safe}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await storage.storage
      .from(BUCKET_NAME)
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (uploadError) {
      return NextResponse.json(
        { error: "Subida falló: " + uploadError.message },
        { status: 500 },
      );
    }

    const rawText = (await extractText(buffer, file.type)) ?? "";
    const created = await addUploadedTranscript({
      businessCaseId: id,
      rawText,
      fileName: file.name,
      fileUrl: path,
      fileSize: file.size,
      mimeType: file.type,
    });
    return NextResponse.json(
      {
        transcript: {
          id: created.id,
          source: created.source,
          fileName: created.fileName,
          hasText: rawText.length > 0,
        },
      },
      { status: 201 },
    );
  }

  // ── Texto pegado (JSON) ────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = PastedTranscriptBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }
  const created = await addPastedTranscript(
    id,
    parsed.data.rawText,
    parsed.data.fileName ?? null,
  );
  return NextResponse.json(
    { transcript: { id: created.id, source: created.source } },
    { status: 201 },
  );
}
