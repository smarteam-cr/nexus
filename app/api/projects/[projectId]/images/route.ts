/**
 * POST /api/projects/[projectId]/images — sube una imagen del canvas Kickoff
 * (portada del hero) y devuelve { url }.
 *
 * Espejo de `app/api/business-cases/[id]/images/route.ts`, con el guard del proyecto.
 * Bucket PÚBLICO `public-assets` (la landing externa renderiza <img> sin auth desde el
 * snapshot congelado — una signed URL de 1h se vencería). Path con UUID criptográfico
 * (`kickoff-images/{projectId}/{uuid}.{ext}`): inadivinable, sin upsert de path fijo.
 *
 * SIN SVG a propósito: el bucket es público y un SVG puede llevar <script> → XSS
 * almacenado. `isAllowedImageType` ya restringe a PNG/JPG/WebP.
 */
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { getStorageClient } from "@/lib/storage/client";
import { uploadPublicAsset, isAllowedImageType, MAX_IMAGE_SIZE } from "@/lib/storage/public-assets";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

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

  const path = `kickoff-images/${projectId}/${randomUUID()}.${EXT_BY_MIME[file.type] ?? "bin"}`;
  const raw = await uploadPublicAsset(path, await file.arrayBuffer(), file.type);
  if (!raw) return NextResponse.json({ error: "No se pudo subir la imagen." }, { status: 500 });

  return NextResponse.json({ url: raw.split("?")[0] });
}
