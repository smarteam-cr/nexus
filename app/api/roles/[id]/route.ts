/**
 * /api/roles/[id] — GET uno · PATCH campos/active/order · DELETE.
 * Superficie SOLO SUPER_ADMIN (guardRolesAdmin).
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { guardRolesAdmin } from "@/lib/auth/api-guards";
import { getRole } from "@/lib/roles/queries";
import { updateRole, deleteRole } from "@/lib/roles/mutations";
import { rolePatchSchema } from "@/lib/roles/schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const role = await getRole(id);
  if (!role) return NextResponse.json({ error: "El rol no existe" }, { status: 404 });
  return NextResponse.json({ role });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = rolePatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  // `content` es Json (objeto opaco): se castea a InputJsonValue aparte; el resto de los
  // campos (title/area/summary/active/order) van tal cual al UpdateInput.
  const { content, ...rest } = parsed.data;
  const data: Prisma.RoleProfileUpdateInput = { ...rest };
  if (content !== undefined) data.content = content as Prisma.InputJsonValue;

  try {
    const role = await updateRole(id, data);
    return NextResponse.json({ role: { id: role.id } });
  } catch {
    return NextResponse.json({ error: "El rol no existe" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    await deleteRole(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "El rol no existe" }, { status: 404 });
  }
}
