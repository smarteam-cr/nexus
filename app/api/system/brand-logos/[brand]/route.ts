/**
 * /api/system/brand-logos/[brand]   (brand: "hubspot" | "insider")
 *
 * Config GLOBAL de logos de PLATAFORMA (HubSpot / Insider One): se muestran en la
 * brand-row de los business cases y en el hero de los kickoffs. Mismo patrón que
 * /api/system/smarteam-logo (SystemConfig singleton id="system").
 *
 *   GET    → { logoUrl }
 *   POST   → sube/reemplaza (FormData "file")
 *   DELETE → quita (no se muestra; el BC cae al badge de texto)
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

const BRANDS: Record<string, { column: "hubspotLogoUrl" | "insiderLogoUrl"; path: string }> = {
  hubspot: { column: "hubspotLogoUrl", path: "system/hubspot-logo" },
  insider: { column: "insiderLogoUrl", path: "system/insider-logo" },
};

type Params = Promise<{ brand: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { brand } = await params;
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const def = BRANDS[brand];
  if (!def) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const cfg = await prisma.systemConfig.findUnique({
    where: { id: SYSTEM_ID },
    select: { [def.column]: true },
  });
  return NextResponse.json({ logoUrl: (cfg as Record<string, string | null> | null)?.[def.column] ?? null });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { brand } = await params;
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const def = BRANDS[brand];
  if (!def) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

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

  const url = await uploadPublicAsset(def.path, await file.arrayBuffer(), file.type);
  if (!url) return NextResponse.json({ error: "No se pudo subir el logo." }, { status: 500 });

  await prisma.systemConfig.upsert({
    where: { id: SYSTEM_ID },
    create: { id: SYSTEM_ID, [def.column]: url },
    update: { [def.column]: url },
  });
  return NextResponse.json({ logoUrl: url });
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { brand } = await params;
  const guard = await guardRole("SUPER_ADMIN");
  if (guard instanceof NextResponse) return guard;
  const def = BRANDS[brand];
  if (!def) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  await removePublicAsset(def.path);
  await prisma.systemConfig.upsert({
    where: { id: SYSTEM_ID },
    create: { id: SYSTEM_ID, [def.column]: null },
    update: { [def.column]: null },
  });
  return NextResponse.json({ ok: true });
}
