/**
 * /api/roles — documentos de Roles (perfiles de puesto y propuestas).
 *
 * GET lista lo VISIBLE para quien pregunta (SUPER_ADMIN todo; el resto, lo que le
 * compartieron — `visibleRoleWhere`). POST crea, y eso sigue siendo SOLO SUPER_ADMIN:
 * compartir da lectura, nunca escritura.
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { guardInternalUser, guardRolesAdmin } from "@/lib/auth/api-guards";
import { loadRoles } from "@/lib/roles/queries";
import { createRole } from "@/lib/roles/mutations";
import { roleCreateSchema } from "@/lib/roles/schema";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const roles = await loadRoles({ role: guard.role, teamMemberId: guard.teamMember.id });
  return NextResponse.json({ roles });
}

export async function POST(req: NextRequest) {
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = roleCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const role = await createRole({
    docType: d.docType,
    title: d.title,
    area: d.area ?? null,
    summary: d.summary ?? null,
    content: (d.content ?? {}) as Prisma.InputJsonValue,
    createdByEmail: guard.user.email,
  });
  return NextResponse.json({ role: { id: role.id } }, { status: 201 });
}
