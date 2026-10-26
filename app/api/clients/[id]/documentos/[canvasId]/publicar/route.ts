/**
 * /api/clients/[id]/documentos/[canvasId]/publicar — compartir con la empresa un documento suyo (R3 etapa 3,
 * 2026-10-27, lib/clients/documentos-de-la-empresa-compartir.ts).
 *
 *   GET     → { publicadoEn, enlace, cambiosSinPublicar }
 *   POST    → congela la foto y asegura el enlace (publicar otra vez la actualiza y conserva el enlace).
 *   DELETE  → deja de compartir: el enlace deja de abrir.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardDocumentoDeLaEmpresa } from "@/lib/clients/documento-de-la-empresa-guard";
import {
  compartirDocumentoDeLaEmpresa,
  dejarDeCompartirDocumentoDeLaEmpresa,
  ErrorDelDocumento,
  estadoDeLoCompartido,
} from "@/lib/clients/documentos-de-la-empresa-compartir";

type Params = { params: Promise<{ id: string; canvasId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id, canvasId } = await params;
  const doc = await guardDocumentoDeLaEmpresa(id, canvasId);
  if (doc instanceof NextResponse) return doc;
  return NextResponse.json(await estadoDeLoCompartido(canvasId));
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id, canvasId } = await params;
  const doc = await guardDocumentoDeLaEmpresa(id, canvasId);
  if (doc instanceof NextResponse) return doc;
  try {
    return NextResponse.json(await compartirDocumentoDeLaEmpresa(id, canvasId, doc.email));
  } catch (e) {
    if (e instanceof ErrorDelDocumento) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, canvasId } = await params;
  const doc = await guardDocumentoDeLaEmpresa(id, canvasId);
  if (doc instanceof NextResponse) return doc;
  await dejarDeCompartirDocumentoDeLaEmpresa(canvasId);
  return NextResponse.json(await estadoDeLoCompartido(canvasId));
}
