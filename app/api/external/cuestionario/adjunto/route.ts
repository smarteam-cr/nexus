/**
 * POST/DELETE /api/external/cuestionario/adjunto — el cliente suma (o quita) un documento a SU
 * pestaña del cuestionario y dice qué es.
 *
 * El archivo entra como un `ClientDocument` más del proyecto (mismo bucket, misma allowlist, mismo
 * tope y misma extracción de texto que la subida interna), atado a la pestaña. Así el CSE lo ve
 * en los documentos del proyecto y los agentes lo leen con su descripción.
 *
 * DESDE EL 2026-09-28 el archivo va del navegador DIRECTO a Supabase (el nginx del VPS corta en
 * 1 MB): `{ accion: "preparar", token, pestana, descripcion, nombre, tipo, tamano }` → permiso firmado;
 * `{ accion: "confirmar", token, pestana, descripcion, path, nombre }` → valida lo real y crea la fila.
 * Las dos vuelven a resolver el token. Ver lib/storage/subida-directa.ts.
 *
 * Pública: el token viaja en el body y lo resuelve `lib/cuestionario/externo.ts` en cada llamada.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { TOKEN_RE, adjuntoBorrable, destinoDeAdjunto } from "@/lib/cuestionario/externo";
import { confirmarDocumento, prepararDocumento } from "@/lib/documents/subida-de-documento";
import { checkExternalWriteRate } from "@/lib/external/write-rate-limit";
import { BUCKET_NAME, getStorageClient } from "@/lib/storage/client";

const MAX_ADJUNTOS_POR_PESTANA = 15;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ ok: false, error: "Este enlace ya no está disponible." }, { status: 404 });
  }
  if (!checkExternalWriteRate(`cuestionario:${token}`)) {
    return NextResponse.json({ ok: false, error: "Demasiados cambios seguidos. Espera unos segundos." }, { status: 429 });
  }
  const descripcion = (typeof body.descripcion === "string" ? body.descripcion : "").trim().slice(0, 1000);
  if (!descripcion) {
    return NextResponse.json({ ok: false, error: "Cuéntanos qué es este documento." }, { status: 400 });
  }

  const { pestana: seccion } = body;
  const destino = await destinoDeAdjunto(token, seccion);
  if ("error" in destino) return NextResponse.json(destino.error, { status: destino.error.status });
  const carpeta = `${destino.clientId}/${destino.projectId}/cuestionario`;

  if (body.accion === "preparar") {
    const ya = await prisma.clientDocument.count({ where: { cuestionarioPestanaId: destino.pestanaId } });
    if (ya >= MAX_ADJUNTOS_POR_PESTANA) {
      return NextResponse.json(
        { ok: false, error: `Esta pestaña ya tiene ${MAX_ADJUNTOS_POR_PESTANA} documentos.` },
        { status: 409 },
      );
    }
    const permiso = await prepararDocumento(carpeta, body);
    if (!permiso.ok) return NextResponse.json({ ok: false, error: permiso.error }, { status: permiso.status });
    return NextResponse.json({ ok: true, signedUrl: permiso.signedUrl, path: permiso.path });
  }

  if (body.accion !== "confirmar") return NextResponse.json({ ok: false, error: "Solicitud inválida" }, { status: 400 });

  const subido = await confirmarDocumento(carpeta, body.path, body.nombre);
  if (!subido.ok) return NextResponse.json({ ok: false, error: subido.error }, { status: subido.status });

  const doc = await prisma.clientDocument.create({
    data: {
      clientId: destino.clientId,
      projectId: destino.projectId,
      cuestionarioPestanaId: destino.pestanaId,
      title: subido.nombre,
      descripcion,
      type: "FILE",
      url: subido.path,
      fileName: subido.nombre,
      fileSize: subido.tamano,
      mimeType: subido.tipo,
      content: subido.contenido,
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
