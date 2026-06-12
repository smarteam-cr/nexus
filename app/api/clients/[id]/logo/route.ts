/**
 * /api/clients/[id]/logo
 *
 *   POST   → sube/reemplaza el logo del cliente (FormData "file") → Client.logoUrl
 *   DELETE → quita el logo
 *
 * Guarded con guardAccessToClient. El logo va al bucket PÚBLICO `public-assets`
 * en un path fijo (client-logos/{clientId}) → URL estable para mostrar en las
 * páginas externas (kickoff/cronograma).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getStorageClient } from "@/lib/storage/client";
import {
  uploadPublicAsset,
  removePublicAsset,
  isAllowedLogoType,
  MAX_LOGO_SIZE,
} from "@/lib/storage/public-assets";

const logoPath = (clientId: string) => `client-logos/${clientId}`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  if (!getStorageClient()) {
    return NextResponse.json({ error: "El almacenamiento no está configurado." }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No se envió ningún archivo." }, { status: 400 });
  if (!isAllowedLogoType(file.type)) {
    return NextResponse.json({ error: "Formato no soportado. Usá PNG, JPG, WebP o SVG." }, { status: 400 });
  }
  if (file.size > MAX_LOGO_SIZE) {
    return NextResponse.json({ error: `La imagen es muy grande (máx ${MAX_LOGO_SIZE / 1024 / 1024}MB).` }, { status: 400 });
  }

  const url = await uploadPublicAsset(logoPath(id), await file.arrayBuffer(), file.type);
  if (!url) return NextResponse.json({ error: "No se pudo subir el logo." }, { status: 500 });

  await prisma.client.update({ where: { id }, data: { logoUrl: url } });
  return NextResponse.json({ logoUrl: url });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  await removePublicAsset(logoPath(id));
  await prisma.client.update({ where: { id }, data: { logoUrl: null } });
  return NextResponse.json({ ok: true });
}
