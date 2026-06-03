import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getStorageClient, BUCKET_NAME, MAX_FILE_SIZE, ensureBucket, storagePath } from "@/lib/storage/client";
import { extractText } from "@/lib/documents/extract-text";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

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

  // Storage debe estar configurado para subir archivos. Si no, error claro
  // (en vez de explotar al importar el módulo, como pasaba antes).
  const storage = getStorageClient();
  if (!storage) {
    return NextResponse.json(
      {
        error:
          "El almacenamiento de archivos no está configurado (faltan credenciales de Supabase Storage). " +
          "Mientras tanto, podés agregar documentos por enlace de Google Drive.",
      },
      { status: 503 },
    );
  }

  // Ensure bucket exists
  await ensureBucket();

  // Upload to Supabase Storage
  const path = storagePath(project.clientId, projectId, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await storage.storage
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
