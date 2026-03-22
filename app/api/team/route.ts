import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withAuth, apiError } from "@/lib/api";

// GET /api/team
export const GET = withAuth(async () => {
  const members = await prisma.teamMember.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ members });
});

// POST /api/team — crear miembro
export const POST = withAuth(async (req: NextRequest) => {
  const { name, email, role } = await req.json();

  if (!name?.trim() || !email?.trim()) return apiError("name y email son requeridos", 400);

  try {
    const member = await prisma.teamMember.create({
      data: { name: name.trim(), email: email.trim().toLowerCase(), role: role?.trim() || null },
    });
    return NextResponse.json({ member }, { status: 201 });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "P2002") return apiError("El correo ya está registrado", 409);
    return apiError("Error interno");
  }
});
