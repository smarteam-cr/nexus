/**
 * GET /api/team/role-permissions — las plantillas de permisos de los 7 roles.
 *
 * Gate DURO: solo SUPER_ADMIN. Para cada rol devuelve las 3 capas que la UI
 * necesita: el default de código, la plantilla de DB (si existe, cruda) y el
 * EFECTIVO del rol (default ← plantilla, sin overrides de usuario). SUPER_ADMIN
 * viene con editable:false (all-true hardcodeado, anti-lockout).
 * Lee la tabla directo (sin el cache TTL del engine): es la vista de administración.
 */
import { NextResponse } from "next/server";
import type { TeamRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { guardRole } from "@/lib/auth/api-guards";
import { parsePermissionMapLoose } from "@/lib/auth/permissions/schema";
import { computeEffective, DEFAULT_MATRIX } from "@/lib/auth/permissions/defaults";

const ROLES: TeamRole[] = ["CSE", "VENTAS", "DEV", "CSL", "MARKETING", "ADMIN", "SUPER_ADMIN"];

export async function GET() {
  const guard = await guardRole("SUPER_ADMIN");
  if (guard instanceof NextResponse) return guard;

  const rows = await prisma.rolePermission.findMany();
  const byRole = new Map(rows.map((r) => [r.role, r]));

  const roles = ROLES.map((role) => {
    const row = byRole.get(role);
    const template = row ? parsePermissionMapLoose(row.permissions) : null;
    return {
      role,
      editable: role !== "SUPER_ADMIN",
      default: DEFAULT_MATRIX[role],
      template,
      effective: computeEffective(role, role === "SUPER_ADMIN" ? null : template, null),
      updatedAt: row?.updatedAt ?? null,
      updatedByEmail: row?.updatedByEmail ?? null,
    };
  });

  return NextResponse.json({ roles });
}
