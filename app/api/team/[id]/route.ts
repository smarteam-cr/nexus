import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/api";
import { guardCapability } from "@/lib/auth/api-guards";
import { revalidateTeamMembers } from "@/lib/cache/team";

type Params = { params: Promise<{ id: string }> };

// PUT /api/team/[id] — actualizar nombre/email/area (solo SUPER_ADMIN).
// El roleEnum (permiso) NO se cambia acá: se gestiona por script esta vuelta.
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await guardCapability("manageTeam");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const { name, email, area, role } = await req.json();
  if (!name?.trim() || !email?.trim()) return apiError("name y email son requeridos", 400);

  try {
    const member = await prisma.teamMember.update({
      where: { id },
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        area: (area ?? role)?.trim() || null,
      },
    });
    revalidateTeamMembers();
    return NextResponse.json({ member });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") return apiError("El correo ya está registrado", 409);
    if (code === "P2025") return apiError("No encontrado", 404);
    return apiError("Error interno");
  }
}

// DELETE /api/team/[id] — DESACTIVA (soft): setea deactivatedAt en vez de borrar,
// para preservar el histórico (sesiones/handoffs/runs). Solo SUPER_ADMIN.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardCapability("manageTeam");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  try {
    await prisma.teamMember.update({
      where: { id },
      data: { deactivatedAt: new Date() },
    });
    revalidateTeamMembers();
    return NextResponse.json({ ok: true });
  } catch {
    return apiError("No encontrado", 404);
  }
}
