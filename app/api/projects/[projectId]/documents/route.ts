/**
 * /api/projects/[projectId]/documents — los DOCUMENTOS DE LA EMPRESA (Información del cliente › Documentos).
 *
 * Desde el 2026-10-07 la lista es de la EMPRESA del proyecto, no del proyecto: Elías pidió que los
 * archivos que se suben en cualquier «Contexto adicional» (preventa o proyecto) queden ahí, «todo a nivel
 * de empresa». Cada fila dice de dónde vino: el proyecto, el contexto de qué pieza (`origen`) o el
 * cuestionario. El acceso es por cliente (ARCHITECTURE §4.3): quien abre un proyecto ve la empresa.
 *
 *   GET    → { documents }
 *   DELETE { documentId } → borra uno de la empresa (los del cuestionario no: los subió el cliente).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { dondeSeSubio } from "@/lib/documents/origen-del-adjunto";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { getSignedUrl } from "@/lib/storage/client";

type Ctx = { params: Promise<{ projectId: string }> };

async function empresaDe(projectId: string): Promise<string | null> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
  return p?.clientId ?? null;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const clientId = await empresaDe(projectId);
  if (!clientId) return NextResponse.json({ documents: [] });

  const docs = await prisma.clientDocument.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      type: true,
      url: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      origen: true,
      cuestionarioPestanaId: true,
      createdAt: true,
      content: true,
      project: { select: { name: true, serviceType: true } },
    },
  });

  const documents = await Promise.all(
    docs.map(async (doc) => {
      // El proyecto de estrategia es la casa de los documentos de la empresa: no se nombra.
      const proyecto = doc.project && doc.project.serviceType !== SENTINEL_SERVICE_TYPE ? doc.project.name : null;
      return {
        id: doc.id,
        title: doc.title,
        type: doc.type,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        downloadUrl: doc.type === "FILE" && doc.url ? await getSignedUrl(doc.url) : doc.url,
        hasContent: !!doc.content, // el contenido entero no viaja en la lista
        createdAt: doc.createdAt.toISOString(),
        /** De dónde vino, en palabras: el contexto de una pieza, el cuestionario o el proyecto. */
        deDonde: doc.cuestionarioPestanaId
          ? "Lo subió el cliente en el cuestionario"
          : (dondeSeSubio(doc.origen) ?? (proyecto ? `Proyecto ${proyecto}` : null)),
        proyecto,
        borrable: !doc.cuestionarioPestanaId,
      };
    }),
  );

  return NextResponse.json({ documents });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const clientId = await empresaDe(projectId);
  if (!clientId) return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });

  const { documentId } = (await req.json().catch(() => ({}))) as { documentId?: unknown };
  if (typeof documentId !== "string" || !documentId) {
    return NextResponse.json({ error: "documentId required" }, { status: 400 });
  }

  const doc = await prisma.clientDocument.findFirst({
    where: { id: documentId, clientId },
    select: { id: true, type: true, url: true, cuestionarioPestanaId: true },
  });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (doc.cuestionarioPestanaId) {
    return NextResponse.json({ error: "Lo subió el cliente en el cuestionario: se quita desde el cuestionario." }, { status: 409 });
  }

  // Delete from storage if it's a FILE (no-op si Storage no está configurado)
  if (doc.type === "FILE" && doc.url) {
    const { removeFile } = await import("@/lib/storage/client");
    await removeFile(doc.url);
  }

  await prisma.clientDocument.delete({ where: { id: documentId } });

  return NextResponse.json({ ok: true });
}
