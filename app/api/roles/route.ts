/**
 * /api/roles — perfiles de puesto del equipo. GET lista · POST crea.
 * Superficie SOLO SUPER_ADMIN (guardRolesAdmin).
 */
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { guardRolesAdmin } from "@/lib/auth/api-guards";
import { loadRoles } from "@/lib/roles/queries";
import { createRole } from "@/lib/roles/mutations";
import { roleCreateSchema } from "@/lib/roles/schema";

export async function GET() {
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ roles: await loadRoles() });
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
    title: d.title,
    area: d.area ?? null,
    summary: d.summary ?? null,
    content: (d.content ?? {}) as Prisma.InputJsonValue,
    createdByEmail: guard.user.email,
  });
  return NextResponse.json({ role: { id: role.id } }, { status: 201 });
}
