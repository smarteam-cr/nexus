/**
 * POST /api/business-cases/[id]/images — sube una imagen de contenido del BC
 * (portada del hero, diagramas) y devuelve { url }.
 *
 * Bucket PÚBLICO `public-assets` (la landing externa renderiza <img> sin auth
 * desde el snapshot congelado — una signed URL de 1h se vencería). Path con UUID
 * criptográfico (`bc-images/{bcId}/{uuid}.{ext}`): inadivinable, sin upsert de
 * path fijo. La URL se guarda dentro del `data` de la sección (Json) — cero schema.
 * Se strippea el query `?t=` cache-bust del helper (con UUID no hay cache que bustear
 * y la URL guardada en el snapshot debe ser limpia).
 */
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getStorageClient } from "@/lib/storage/client";
import { uploadPublicAsset, isAllowedImageType, MAX_IMAGE_SIZE } from "@/lib/storage/public-assets";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({ where: { id }, select: { id: true } });
  if (!bc) return NextResponse.json({ error: "Business case no existe" }, { status: 404 });

  if (!getStorageClient()) {
    return NextResponse.json({ error: "El almacenamiento no está configurado." }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No se envió ningún archivo." }, { status: 400 });
  if (!isAllowedImageType(file.type)) {
    return NextResponse.json({ error: "Formato no soportado. Usá PNG, JPG o WebP." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json(
      { error: `La imagen es muy grande (máx ${MAX_IMAGE_SIZE / 1024 / 1024}MB).` },
      { status: 400 },
    );
  }

  const path = `bc-images/${id}/${randomUUID()}.${EXT_BY_MIME[file.type] ?? "bin"}`;
  const raw = await uploadPublicAsset(path, await file.arrayBuffer(), file.type);
  if (!raw) return NextResponse.json({ error: "No se pudo subir la imagen." }, { status: 500 });

  const url = raw.split("?")[0];
  return NextResponse.json({ url });
}
