import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { supabaseStorage, BUCKET_NAME, MAX_FILE_SIZE, ensureBucket, storagePath } from "@/lib/storage/client";

const MAX_EXTRACTED_CHARS = 50000;

async function extractText(buffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    // Plain text / CSV
    if (mimeType === "text/plain" || mimeType === "text/csv") {
      return new TextDecoder().decode(buffer).slice(0, MAX_EXTRACTED_CHARS);
    }

    // PDF
    if (mimeType === "application/pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer, { max: 100 }); // max 100 pages
      const text = result.text?.trim();
      if (!text || text.length < 10) return null; // Probably scanned PDF
      return text.slice(0, MAX_EXTRACTED_CHARS);
    }

    return null;
  } catch {
    return null; // Extraction failed silently (scanned PDF, corrupted, etc.)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  // Verificar que el proyecto existe y obtener clientId
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, { status: 400 });
  }

  // Ensure bucket exists
  await ensureBucket();

  // Upload to Supabase Storage
  const path = storagePath(project.clientId, projectId, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseStorage.storage
    .from(BUCKET_NAME)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[file-upload] Supabase error:", uploadError);
    return NextResponse.json({ error: "Upload failed: " + uploadError.message }, { status: 500 });
  }

  // Extract text when possible (TXT, CSV, PDF)
  const extractedContent = await extractText(buffer, file.type);

  // Create ClientDocument record
  const doc = await prisma.clientDocument.create({
    data: {
      clientId: project.clientId,
      projectId,
      title: file.name,
      type: "FILE",
      url: path, // Storage path (not public URL — use signed URLs to access)
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      content: extractedContent,
    },
  });

  return NextResponse.json({
    id: doc.id,
    title: doc.title,
    fileName: doc.fileName,
    fileSize: doc.fileSize,
    mimeType: doc.mimeType,
    hasContent: !!doc.content,
    createdAt: doc.createdAt.toISOString(),
  });
}
