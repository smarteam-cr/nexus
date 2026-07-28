/**
 * /api/clients/[id]/logo
 *
 *   POST   → sube/reemplaza el logo del cliente (FormData "file") → Client.logoUrl
 *   DELETE → quita el logo
 *
 * Con `?variant=dark` opera sobre la SEGUNDA versión, la de fondo oscuro
 * (`Client.logoDarkUrl`, path `client-logos/{id}-dark`). Sin el query string el
 * comportamiento es EXACTAMENTE el de antes — por eso se parametrizó esta ruta en vez de
 * duplicarla: mismo guard, mismos tipos, mismo límite, y `LogoUploader` sirve sin tocarlo
 * (pasa el `endpoint` verbatim al POST y al DELETE, así que el query viaja solo).
 *
 * ── LA VARIANTE OSCURA ES LA ALTERNATIVA DEL PRIMARIO, NO UN ASSET SUELTO ────
 * Borrar el primario borra las DOS. Un logo diseñado para fondo oscuro es tinta clara:
 * sobre el blanco del cronograma desaparecería, así que "solo oscura" no es un estado
 * que se pueda pintar. Además `normalizeBrands` (hero-parts.tsx) decide con
 * `!!ctx.clientLogoUrl` si pinta imagen o badge de texto: sin primario caería al badge
 * teniendo un archivo cargado.
 *
 * Guarded con guardAccessToClient. Bucket PÚBLICO `public-assets` en paths fijos → URL
 * estable para las páginas externas (kickoff/cronograma), que el cliente deja abiertas.
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

const logoPath = (clientId: string, dark: boolean) =>
  dark ? `client-logos/${clientId}-dark` : `client-logos/${clientId}`;

/** `?variant=dark` → la versión para fondo oscuro. Cualquier otra cosa → el primario. */
const esDark = (req: NextRequest) => req.nextUrl.searchParams.get("variant") === "dark";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  if (!getStorageClient()) {
    return NextResponse.json({ error: "El almacenamiento no está configurado." }, { status: 503 });
  }

  const dark = esDark(req);

  // La versión oscura no existe sola: sin primario no habría qué mostrar en las
  // superficies de fondo claro. Se corta acá y no solo en la UI.
  if (dark) {
    const actual = await prisma.client.findUnique({ where: { id }, select: { logoUrl: true } });
    if (!actual?.logoUrl) {
      return NextResponse.json(
        { error: "Subí primero el logo principal: la versión para fondo oscuro es su alternativa." },
        { status: 400 },
      );
    }
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

  const url = await uploadPublicAsset(logoPath(id, dark), await file.arrayBuffer(), file.type);
  if (!url) return NextResponse.json({ error: "No se pudo subir el logo." }, { status: 500 });

  await prisma.client.update({
    where: { id },
    data: dark ? { logoDarkUrl: url } : { logoUrl: url },
  });
  // La clave del JSON cambia con la variante: `LogoUploader` la lee por `responseKey`.
  return NextResponse.json(dark ? { logoDarkUrl: url } : { logoUrl: url });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const dark = esDark(req);

  if (dark) {
    await removePublicAsset(logoPath(id, true));
    await prisma.client.update({ where: { id }, data: { logoDarkUrl: null } });
    return NextResponse.json({ ok: true });
  }

  // Borrar el primario borra TAMBIÉN la variante oscura (ver cabecera): dejarla huérfana
  // sería un objeto en el bucket sin fila que lo referencie y un estado imposible de pintar.
  await Promise.all([removePublicAsset(logoPath(id, false)), removePublicAsset(logoPath(id, true))]);
  await prisma.client.update({ where: { id }, data: { logoUrl: null, logoDarkUrl: null } });
  return NextResponse.json({ ok: true });
}
