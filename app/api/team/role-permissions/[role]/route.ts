/**
 * PUT /api/team/role-permissions/[role] — guarda la PLANTILLA de un rol.
 *
 * Gate DURO: solo SUPER_ADMIN. Rechaza editar la plantilla de SUPER_ADMIN
 * (anti-lockout: es all-true hardcodeado en el engine). Body:
 *   { permissions: PermissionMap }  — validado zod ESTRICTO contra el registry.
 * Upsert idempotente + invalida el cache TTL del engine en esta instancia
 * (las demás instancias lo ven en ≤60s).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { TeamRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/api";
import { guardRole } from "@/lib/auth/api-guards";
import { permissionMapWriteSchema, parsePermissionMapLoose } from "@/lib/auth/permissions/schema";
import { computeEffective } from "@/lib/auth/permissions/defaults";
import { invalidateRolePermissionCache } from "@/lib/auth/permissions/engine";

type Params = { params: Promise<{ role: string }> };

const EDITABLE_ROLES = ["CSE", "VENTAS", "DEV", "CSL", "MARKETING", "ADMIN"] as const;

const bodySchema = z.strictObject({ permissions: permissionMapWriteSchema });

export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await guardRole("SUPER_ADMIN");
  if (guard instanceof NextResponse) return guard;

  const { role: roleParam } = await params;
  if (roleParam === "SUPER_ADMIN") {
    return apiError("La plantilla de Super Admin no se edita: siempre tiene todos los permisos (anti-lockout).", 400);
  }
  if (!(EDITABLE_ROLES as readonly string[]).includes(roleParam)) {
    return apiError("Rol desconocido", 404);
  }
  const role = roleParam as TeamRole;

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", message: "Plantilla inválida: hay claves fuera del catálogo o valores no booleanos.", details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return apiError("JSON inválido", 400);
  }

  const row = await prisma.rolePermission.upsert({
    where: { role },
    create: { role, permissions: body.permissions, updatedByEmail: guard.user.email },
    update: { permissions: body.permissions, updatedByEmail: guard.user.email },
  });
  invalidateRolePermissionCache(role);

  const template = parsePermissionMapLoose(row.permissions);
  return NextResponse.json({
    role,
    template,
    effective: computeEffective(role, template, null),
    updatedAt: row.updatedAt,
    updatedByEmail: row.updatedByEmail,
  });
}
