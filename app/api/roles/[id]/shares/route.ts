/**
 * /api/roles/[id]/shares — con quién está compartido un documento de Roles.
 *
 * GET lista · POST comparte · DELETE deja de compartir. Los TRES son de dirección **y del
 * CSL** (`guardRolesSharing`, 2026-09-23): lo que otorgan es LECTURA — el lector común no
 * edita ni re-comparte; el CSL sí administra el acceso, pero SOLO de los documentos que ya
 * puede leer, y sigue sin poder editar el contenido.
 *
 * ⚠ El guard recibe el `id` a propósito: es lo que impide que un rol que no ve todos los
 * documentos administre el acceso de uno ajeno probando ids en la URL.
 *
 * La lista de personas para elegir sale del `GET /api/team` que ya existe — mismo patrón
 * que `components/clients/ClientSharing.tsx`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardRolesSharing } from "@/lib/auth/api-guards";
import { loadRoleShares, shareRoleDoc, unshareRoleDoc } from "@/lib/roles/mutations";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ teamMemberId: z.string().min(1) });

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await guardRolesSharing(id);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ shares: await loadRoleShares(id) });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await guardRolesSharing(id);
  if (guard instanceof NextResponse) return guard;

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
  const { id } = await params;
  const guard = await guardRolesSharing(id);
  if (guard instanceof NextResponse) return guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta la persona." }, { status: 400 });
  }

  await unshareRoleDoc(id, parsed.data.teamMemberId);
  return NextResponse.json({ shares: await loadRoleShares(id) });
}
