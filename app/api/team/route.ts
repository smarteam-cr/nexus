import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/api";
import { guardInternalUser, guardCapability } from "@/lib/auth/api-guards";
import { revalidateTeamMembers, TEAM_MEMBER_SAFE_SELECT } from "@/lib/cache/team";

// GET /api/team — lista miembros ACTIVOS (cualquier interno).
// SELECT explícito (allowlist): TeamMember tiene una relación con los costos
// (salarios estimados, SUPER_ADMIN-only) — acá NUNCA va un include.
export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const members = await prisma.teamMember.findMany({
    where: { deactivatedAt: null },
    orderBy: { createdAt: "asc" },
    // SELECT explícito (allowlist escalar): excluye la relación de costos
    // (salarios, SUPER_ADMIN-only) Y `permissionOverrides` (los pines por-persona,
    // solo vía /api/team/[id]/permissions) — no está en la lista. Este GET lo
    // consume TODO interno (selector del kickoff, compartir clientes).
    select: TEAM_MEMBER_SAFE_SELECT,
  });
  return NextResponse.json({ members });
}

// POST /api/team — crear miembro (solo SUPER_ADMIN). `area` = eje de análisis;
// roleEnum (permiso) arranca en CSE y se cambia por script.
export async function POST(req: NextRequest) {
  const guard = await guardCapability("manageTeam");
  if (guard instanceof NextResponse) return guard;

  const { name, email, area, role } = await req.json();
  if (!name?.trim() || !email?.trim()) return apiError("name y email son requeridos", 400);

  try {
    const member = await prisma.teamMember.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        area: (area ?? role)?.trim() || null,
      },
      select: TEAM_MEMBER_SAFE_SELECT,
    });
    revalidateTeamMembers();
    return NextResponse.json({ member }, { status: 201 });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "P2002") return apiError("El correo ya está registrado", 409);
    return apiError("Error interno");
  }
}
