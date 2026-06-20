/**
 * /api/system/smarteam-logo
 *
 * Config GLOBAL del sistema (no por usuario): el logo de Smarteam que se muestra
 * en el chrome externo (ExternalShell). Guardado en SystemConfig (singleton
 * id="system"). Guarded con guardInternalUser (solo consultores internos).
 *
 *   GET    → { logoUrl }
 *   POST   → sube/reemplaza (FormData "file") → SystemConfig.smarteamLogoUrl
 *   DELETE → quita (vuelve al fallback /logo-smarteam.png)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser, guardRole } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getStorageClient } from "@/lib/storage/client";
import {
  uploadPublicAsset,
  removePublicAsset,
  isAllowedLogoType,
  MAX_LOGO_SIZE,
} from "@/lib/storage/public-assets";

const SYSTEM_ID = "system";
const LOGO_PATH = "system/smarteam-logo";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const cfg = await prisma.systemConfig.findUnique({
    where: { id: SYSTEM_ID },
    select: { smarteamLogoUrl: true },
  });
  return NextResponse.json({ logoUrl: cfg?.smarteamLogoUrl ?? null });
}

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
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

  const url = await uploadPublicAsset(LOGO_PATH, await file.arrayBuffer(), file.type);
  if (!url) return NextResponse.json({ error: "No se pudo subir el logo." }, { status: 500 });

  await prisma.systemConfig.upsert({
    where: { id: SYSTEM_ID },
    create: { id: SYSTEM_ID, smarteamLogoUrl: url },
    update: { smarteamLogoUrl: url },
  });
  return NextResponse.json({ logoUrl: url });
}

export async function DELETE() {
  const guard = await guardRole("SUPER_ADMIN");
  if (guard instanceof NextResponse) return guard;

  await removePublicAsset(LOGO_PATH);
  await prisma.systemConfig.upsert({
    where: { id: SYSTEM_ID },
    create: { id: SYSTEM_ID, smarteamLogoUrl: null },
    update: { smarteamLogoUrl: null },
  });
  return NextResponse.json({ ok: true });
}
