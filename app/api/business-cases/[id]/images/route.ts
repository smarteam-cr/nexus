/**
 * POST /api/business-cases/[id]/images — imagen de contenido del BC (portada del hero, diagramas).
 *
 * Bucket PÚBLICO `public-assets` (la landing externa renderiza <img> sin auth desde el snapshot
 * congelado — una signed URL de 1h se vencería). Path con UUID criptográfico
 * (`bc-images/{bcId}/{uuid}.{ext}`): inadivinable, sin upsert de path fijo. La URL se guarda dentro
 * del `data` de la sección (Json) — cero schema.
 *
 * DESDE EL 2026-09-28 la imagen va del navegador DIRECTO a Supabase (el VPS corta en 1 MB y estas
 * llegan a 4): `{ accion: "preparar", nombre, tipo, tamano }` → permiso firmado;
 * `{ accion: "confirmar", path }` → valida lo real y devuelve `{ url }`. Ver lib/storage/subida-directa.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { confirmarImagen, prepararImagen } from "@/lib/storage/subida-de-imagen";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({ where: { id }, select: { id: true } });
  if (!bc) return NextResponse.json({ error: "Esa propuesta no existe" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const carpeta = `bc-images/${id}`;
  if (body.accion === "preparar") {
    const permiso = await prepararImagen(carpeta, body);
    if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: permiso.status });
    return NextResponse.json({ signedUrl: permiso.signedUrl, path: permiso.path });
  }
  if (body.accion !== "confirmar") return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  const r = await confirmarImagen(carpeta, body.path);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ url: r.url });
}
