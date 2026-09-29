/**
 * POST /api/projects/[projectId]/documents/upload — subir un documento al proyecto.
 *
 * DESDE EL 2026-09-28 EL ARCHIVO NO PASA POR ACÁ: va del navegador directo a Supabase (el nginx del
 * VPS corta en 1 MB y la pantalla prometía 10). Esta ruta hace los dos pasos que sí son del servidor:
 *   · `{ accion: "preparar", nombre, tipo, tamano }` → valida lo declarado y da un permiso firmado.
 *   · `{ accion: "confirmar", path, nombre }` → valida lo REAL, extrae el texto y crea la fila.
 * El porqué y el flujo, en lib/storage/subida-directa.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { isDocumentMimeAllowed } from "@/lib/storage/client";
import { confirmarDocumento, prepararDocumento } from "@/lib/documents/subida-de-documento";

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, clientId: true } });
  if (!project) return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const carpeta = `${project.clientId}/${projectId}`;

  if (body.accion === "preparar") {
    // A-17: el tipo se mira ANTES de dar el permiso de subida (y de nuevo, contra lo real, al confirmar).
    if (!isDocumentMimeAllowed(typeof body.tipo === "string" ? body.tipo : "")) {
      return NextResponse.json(
        { error: `Tipo de archivo no permitido (${body.tipo || "desconocido"}). Se aceptan PDF, Office, texto/CSV e imágenes.` },
        { status: 415 },
      );
    }
    const permiso = await prepararDocumento(carpeta, body);
    if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: permiso.status });
    return NextResponse.json({ signedUrl: permiso.signedUrl, path: permiso.path });
  }

  if (body.accion !== "confirmar") return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const subido = await confirmarDocumento(carpeta, body.path, body.nombre);
  if (!subido.ok) return NextResponse.json({ error: subido.error }, { status: subido.status });

  const doc = await prisma.clientDocument.create({
    data: {
      clientId: project.clientId,
      projectId,
      title: subido.nombre,
      type: "FILE",
      url: subido.path, // path de Storage (bucket privado: se lee con enlace firmado)
      fileName: subido.nombre,
      fileSize: subido.tamano,
      mimeType: subido.tipo,
      content: subido.contenido,
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
