/**
 * /api/roles/[id]/shares — con quién está compartido un documento de Roles.
 *
 * GET lista · POST comparte · DELETE deja de compartir. Los TRES son SOLO SUPER_ADMIN:
 * compartir es una decisión de dirección, y lo que otorga es LECTURA (el lector no puede
 * re-compartir, editar ni publicar).
 *
 * La lista de personas para elegir sale del `GET /api/team` que ya existe — mismo patrón
 * que `components/clients/ClientSharing.tsx`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardRolesAdmin } from "@/lib/auth/api-guards";
import { loadRoleShares, shareRoleDoc, unshareRoleDoc } from "@/lib/roles/mutations";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ teamMemberId: z.string().min(1) });

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  return NextResponse.json({ shares: await loadRoleShares(id) });
}

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Elige con quién compartirlo." }, { status: 400 });
  }

  try {
    await shareRoleDoc(id, parsed.data.teamMemberId, guard.user.email);
  } catch {
    // FK rota = el documento o la persona no existen. Un 404 neutro, sin decir cuál.
    return NextResponse.json({ error: "No se pudo compartir." }, { status: 404 });
  }
  return NextResponse.json({ shares: await loadRoleShares(id) }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta la persona." }, { status: 400 });
  }

  await unshareRoleDoc(id, parsed.data.teamMemberId);
  return NextResponse.json({ shares: await loadRoleShares(id) });
}
