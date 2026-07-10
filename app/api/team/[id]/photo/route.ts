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
  MAX_LOGO_SIZE,
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

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No se envió ningún archivo." }, { status: 400 });
  if (!isAllowedLogoType(file.type)) {
    return NextResponse.json({ error: "Formato no soportado. Usá PNG, JPG, WebP o SVG." }, { status: 400 });
  }
  if (file.size > MAX_LOGO_SIZE) {
    return NextResponse.json({ error: `La imagen es muy grande (máx ${MAX_LOGO_SIZE / 1024 / 1024}MB).` }, { status: 400 });
  }

  const url = await uploadPublicAsset(photoPath(id), await file.arrayBuffer(), file.type);
  if (!url) return NextResponse.json({ error: "No se pudo subir la foto." }, { status: 500 });

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
