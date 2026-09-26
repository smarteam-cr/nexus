/**
 * POST/DELETE /api/external/cuestionario/adjunto — el cliente suma (o quita) un documento a SU
 * pestaña del cuestionario y dice qué es.
 *
 * El archivo entra como un `ClientDocument` más del proyecto (mismo bucket, misma allowlist, mismo
 * tope y misma extracción de texto que la subida interna), atado a la pestaña. Así el CSE lo ve
 * en los documentos del proyecto y los agentes lo leen con su descripción.
 *
 * Pública: el token viaja en el body y lo resuelve `lib/cuestionario/externo.ts` en cada llamada.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { adjuntoBorrable, destinoDeAdjunto } from "@/lib/cuestionario/externo";
import { extractText } from "@/lib/documents/extract-text";
import { checkExternalWriteRate } from "@/lib/external/write-rate-limit";
import {
  BUCKET_NAME,
  MAX_FILE_SIZE,
  ensureBucket,
  getStorageClient,
  isDocumentMimeAllowed,
  storagePath,
} from "@/lib/storage/client";

const MAX_ADJUNTOS_POR_PESTANA = 15;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida" }, { status: 400 });
  }
  const token = form.get("token");
  const key = form.get("key");
  const file = form.get("file");
  const descripcion = (typeof form.get("descripcion") === "string" ? (form.get("descripcion") as string) : "")
    .trim()
    .slice(0, 1000);

  if (typeof token !== "string" || !checkExternalWriteRate(`cuestionario:${token}`)) {
    return NextResponse.json({ ok: false, error: "Demasiados cambios seguidos. Espera unos segundos." }, { status: 429 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Elige un archivo." }, { status: 400 });
  }
  if (!descripcion) {
    return NextResponse.json({ ok: false, error: "Cuéntanos qué es este documento." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { ok: false, error: `El archivo pesa más de ${MAX_FILE_SIZE / 1024 / 1024} MB. Prueba con uno más liviano o compártelo por enlace en el contexto.` },
      { status: 400 },
    );
  }
  // Allowlist ANTES de subir (A-17): `file.type` lo declara el navegador, pero cierra el caso común.
  if (!isDocumentMimeAllowed(file.type)) {
    return NextResponse.json(
      { ok: false, error: "Ese tipo de archivo no se acepta. Puedes subir PDF, Word, Excel, PowerPoint, texto, CSV o imágenes." },
      { status: 415 },
    );
  }

  const destino = await destinoDeAdjunto(token, key);
  if ("error" in destino) return NextResponse.json(destino.error, { status: destino.error.status });

  const ya = await prisma.clientDocument.count({ where: { cuestionarioPestanaId: destino.pestanaId } });
  if (ya >= MAX_ADJUNTOS_POR_PESTANA) {
    return NextResponse.json(
      { ok: false, error: `Esta pestaña ya tiene ${MAX_ADJUNTOS_POR_PESTANA} documentos.` },
      { status: 409 },
    );
  }

  const storage = getStorageClient();
  if (!storage) {
    return NextResponse.json(
      { ok: false, error: "No podemos recibir archivos en este momento. Compártelo por enlace en el contexto de la pestaña." },
      { status: 503 },
    );
  }
  await ensureBucket();
  const path = storagePath(destino.clientId, destino.projectId, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await storage.storage.from(BUCKET_NAME).upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) {
    console.error("[cuestionario] subida falló:", error.message);
    return NextResponse.json({ ok: false, error: `No se pudo subir el archivo: ${error.message}` }, { status: 500 });
  }

  const content = await extractText(buffer, file.type);
  const doc = await prisma.clientDocument.create({
    data: {
      clientId: destino.clientId,
      projectId: destino.projectId,
      cuestionarioPestanaId: destino.pestanaId,
      title: file.name.slice(0, 200),
      descripcion,
      type: "FILE",
      url: path,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      content,
    },
    select: { id: true, title: true, descripcion: true, fileSize: true },
  });
  return NextResponse.json({
    ok: true,
    adjunto: { id: doc.id, titulo: doc.title, descripcion: doc.descripcion, fileSize: doc.fileSize },
  });
}

export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida" }, { status: 400 });
  }
  const doc = await adjuntoBorrable(body?.token, body?.documentoId);
  if (!doc) return NextResponse.json({ ok: false, error: "Ese documento ya no se puede quitar." }, { status: 404 });

  await prisma.clientDocument.delete({ where: { id: doc.id } });
  // El archivo se borra después de la fila: si el Storage falla, queda un huérfano en el bucket
  // (inofensivo), nunca una fila que apunta a nada.
  const storage = getStorageClient();
  if (storage && doc.url) {
    const { error } = await storage.storage.from(BUCKET_NAME).remove([doc.url]);
    if (error) console.error("[cuestionario] no se pudo borrar el archivo:", error.message);
  }
  return NextResponse.json({ ok: true });
}
