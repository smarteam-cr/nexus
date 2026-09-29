/**
 * /api/business-cases/[id]/transcript
 *   GET  → lista los transcripts del caso
 *   POST → adjunta un transcript:
 *           - JSON { source:"PASTED", rawText, fileName? } → texto pegado
 *           - JSON { accion:"preparar" | "confirmar", … } → archivo subido DIRECTO a Storage
 *             desde el navegador (lib/storage/subir-directo.ts) + extracción de texto
 *
 * El transcript alimenta la generación. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { confirmarDocumento, prepararDocumento } from "@/lib/documents/subida-de-documento";
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
    return NextResponse.json({ error: "Esa propuesta no existe" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const accion = (body as { accion?: unknown })?.accion;

  // ── Archivo: directo del navegador a Storage (el VPS corta en 1 MB) ─────────
  // `preparar` da el permiso firmado; `confirmar` valida lo real, extrae el texto y lo registra.
  // El porqué, en lib/storage/subida-directa.ts.
  const carpeta = `business-cases/${id}`;
  if (accion === "preparar") {
    const permiso = await prepararDocumento(carpeta, body as Record<string, unknown>);
    if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: permiso.status });
    return NextResponse.json({ signedUrl: permiso.signedUrl, path: permiso.path });
  }
  if (accion === "confirmar") {
    const { path, nombre } = body as { path?: unknown; nombre?: unknown };
    if (typeof path === "string" && (await prisma.businessCaseTranscript.findFirst({ where: { fileUrl: path }, select: { id: true } }))) {
      return NextResponse.json({ error: "Ese archivo ya estaba registrado." }, { status: 409 });
    }
    const subido = await confirmarDocumento(carpeta, path, nombre);
    if (!subido.ok) return NextResponse.json({ error: subido.error }, { status: subido.status });
    const rawText = subido.contenido ?? "";
    const created = await addUploadedTranscript({
      businessCaseId: id,
      rawText,
      fileName: subido.nombre,
      fileUrl: subido.path,
      fileSize: subido.tamano,
      mimeType: subido.tipo,
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
