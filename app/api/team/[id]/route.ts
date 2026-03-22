import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAuth, apiError } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// PUT /api/team/[id] — actualizar miembro
export const PUT = withAuth(async (req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const { name, email, role } = await req.json();

  if (!name?.trim() || !email?.trim()) return apiError("name y email son requeridos", 400);

  try {
    const member = await prisma.teamMember.update({
      where: { id },
      data: { name: name.trim(), email: email.trim().toLowerCase(), role: role?.trim() || null },
    });
    return NextResponse.json({ member });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") return apiError("El correo ya está registrado", 409);
    if (code === "P2025") return apiError("No encontrado", 404);
    return apiError("Error interno");
  }
});

// DELETE /api/team/[id] — eliminar miembro
export const DELETE = withAuth(async (_req: NextRequest, { params }: Params) => {
  const { id } = await params;
  try {
    await prisma.teamMember.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return apiError("No encontrado", 404);
  }
});
