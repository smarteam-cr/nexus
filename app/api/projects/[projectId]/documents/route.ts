import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSignedUrl } from "@/lib/storage/client";

// GET: list project documents
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const docs = await prisma.clientDocument.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      type: true,
      url: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      content: true,
      createdAt: true,
    },
  });

  // Generate signed URLs for FILE type documents
  const docsWithUrls = await Promise.all(
    docs.map(async (doc) => {
      if (doc.type === "FILE" && doc.url) {
        const signedUrl = await getSignedUrl(doc.url);
        return {
          ...doc,
          downloadUrl: signedUrl,
          hasContent: !!doc.content,
          content: undefined, // Don't send full content in list
          createdAt: doc.createdAt.toISOString(),
        };
      }
      return {
        ...doc,
        downloadUrl: doc.url,
        hasContent: !!doc.content,
        content: undefined,
        createdAt: doc.createdAt.toISOString(),
      };
    })
  );

  return NextResponse.json({ documents: docsWithUrls });
}

// DELETE: remove a document
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const { documentId } = await req.json();

  if (!documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 });
  }

  const doc = await prisma.clientDocument.findFirst({
    where: { id: documentId, projectId },
  });

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Delete from storage if it's a FILE (no-op si Storage no está configurado)
  if (doc.type === "FILE" && doc.url) {
    const { removeFile } = await import("@/lib/storage/client");
    await removeFile(doc.url);
  }

  await prisma.clientDocument.delete({ where: { id: documentId } });

  return NextResponse.json({ ok: true });
}
