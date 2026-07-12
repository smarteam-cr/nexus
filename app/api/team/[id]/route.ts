import { NextRequest, NextResponse } from "next/server";
import type { TeamRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/api";
import { guardCapability } from "@/lib/auth/api-guards";
import { revalidateTeamMembers, TEAM_MEMBER_SAFE_SELECT } from "@/lib/cache/team";

type Params = { params: Promise<{ id: string }> };

/**
 * Carga el miembro target y protege a los SUPER_ADMIN: `equipo.manage` es delegable
 * (un rol no-SA puede recibirlo por plantilla/override), pero editar o desactivar a
 * un Super Admin queda SOLO para otro Super Admin — así un delegado no puede romper
 * el login (email) ni el anti-lockout de nadie con más poder. Devuelve el target
 * (id + rol) o una NextResponse de error.
 */
async function loadProtectedTarget(id: string, actorRole: TeamRole) {
  const target = await prisma.teamMember.findUnique({
    where: { id },
    select: { id: true, roleEnum: true },
  });
  if (!target) return apiError("No encontrado", 404);
  if (target.roleEnum === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN") {
    return apiError("Solo un Super Admin puede modificar a otro Super Admin.", 403);
  }
  return target;
}

// PUT /api/team/[id] — actualizar nombre/email/area. Gate: equipo.manage (+ protección
// de target SA arriba). El roleEnum/permisos se gestionan en /api/team/[id]/permissions.
// SELECT explícito (allowlist): jamás devolver la relación de costos (salarios).
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await guardCapability("manageTeam");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const target = await loadProtectedTarget(id, guard.role);
  if (target instanceof NextResponse) return target;

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
      select: TEAM_MEMBER_SAFE_SELECT,
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
// para preservar el histórico (sesiones/handoffs/runs). Gate: equipo.manage + protección
// de target SA + anti-lockout (no desactivar al ÚLTIMO Super Admin activo).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardCapability("manageTeam");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const target = await loadProtectedTarget(id, guard.role);
  if (target instanceof NextResponse) return target;

  // Anti-lockout: desactivar al único SA activo deja el sistema sin quien administre
  // permisos (gate duro SA en /team) — irreversible por UI. Se cuenta dentro de una
  // transacción serializable para que dos DELETE concurrentes no bajen los dos últimos.
  if (target.roleEnum === "SUPER_ADMIN") {
    try {
      await prisma.$transaction(
        async (tx) => {
          const otherSA = await tx.teamMember.count({
            where: { roleEnum: "SUPER_ADMIN", deactivatedAt: null, id: { not: id } },
          });
          if (otherSA === 0) throw new Error("LAST_SA");
          await tx.teamMember.update({ where: { id }, data: { deactivatedAt: new Date() } });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (e) {
      if (e instanceof Error && e.message === "LAST_SA") {
        return apiError("No podés desactivar al único Super Admin activo.", 400);
      }
      return apiError("No encontrado", 404);
    }
    revalidateTeamMembers();
    return NextResponse.json({ ok: true });
  }

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
