/**
 * /api/team/[id]/photo
 *
 *   POST   → sube/reemplaza la foto del miembro (FormData "file") → TeamMember.photoUrl
 *   DELETE → quita la foto
 *
 * Guarded con guardCapability("manageTeam") (mismo gate que crear miembros). La foto
 * va al bucket PÚBLICO `public-assets` en un path fijo (team-photos/{memberId}) → URL
 * estable para el selector de equipo del Kickoff (que la snapshotea al seleccionar).
 * Calcado de app/api/clients/[id]/logo/route.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getStorageClient } from "@/lib/storage/client";
import {
  uploadPublicAsset,
  removePublicAsset,
  isAllowedLogoType,
  MAX_PHOTO_SIZE,
  mensajeDeFotoMuyGrande,
} from "@/lib/storage/public-assets";
import { revalidateTeamMembers } from "@/lib/cache/team";

const photoPath = (memberId: string) => `team-photos/${memberId}`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardCapability("manageTeam");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  if (!getStorageClient()) {
    return NextResponse.json({ error: "El almacenamiento no está configurado." }, { status: 503 });
  }

  /* ⚠ `formData()` LANZA si el cuerpo llegó cortado o mal formado —lo que pasa justamente cuando
     un proxy corta la subida a mitad—. Sin este try, la excepción sube, Next contesta un 500 sin
     `error` en el JSON, y el cliente cae a su mensaje genérico: el fallo se vuelve mudo otra vez. */
  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    console.error(`[team/photo] cuerpo ilegible: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    return NextResponse.json(
      { error: "El archivo no llegó completo al servidor. Suele pasar con fotos muy pesadas: probá con una más liviana." },
      { status: 400 },
    );
  }
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No se envió ningún archivo." }, { status: 400 });
  if (!isAllowedLogoType(file.type)) {
    return NextResponse.json({ error: "Formato no soportado. Usá PNG, JPG, WebP o SVG." }, { status: 400 });
  }
  /* El tope de la FOTO, no el del logo: C-22 bajó `MAX_LOGO_SIZE` a 300 KB por un logo de 30 px
     y esta ruta quedó arrastrada, rechazando casi toda foto de celular con un mensaje que
     además decía «máx 0.29296875MB». */
  if (file.size > MAX_PHOTO_SIZE) {
    return NextResponse.json({ error: mensajeDeFotoMuyGrande(file.size) }, { status: 400 });
  }

  const subida = await uploadPublicAsset(photoPath(id), await file.arrayBuffer(), file.type);
  if (!subida.ok) {
    // El motivo VIAJA: «no se pudo» no le dice a nadie qué arreglar (ver public-assets.ts).
    return NextResponse.json({ error: subida.mensaje, motivo: subida.motivo }, { status: 502 });
  }
  const url = subida.url;

  await prisma.teamMember.update({ where: { id }, data: { photoUrl: url } });
  revalidateTeamMembers();
  return NextResponse.json({ photoUrl: url });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardCapability("manageTeam");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  await removePublicAsset(photoPath(id));
  await prisma.teamMember.update({ where: { id }, data: { photoUrl: null } });
  revalidateTeamMembers();
  return NextResponse.json({ ok: true });
}
