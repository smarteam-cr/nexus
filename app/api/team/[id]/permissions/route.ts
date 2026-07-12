/**
 * /api/team/[id]/permissions — permisos de UN miembro (GET) + edición (PATCH).
 *
 * Gate DURO: solo SUPER_ADMIN (decisión del usuario: administrar permisos no es
 * delegable — ni siquiera vía equipo.manage). PATCH acepta cualquier subconjunto:
 *   { roleEnum?, canViewAllClients?, canViewAllExpiresAt?, permissionOverrides? }
 *
 * Reglas anti-lockout:
 *   - No se puede degradar al ÚLTIMO Super Admin activo.
 *   - Un SUPER_ADMIN no lleva overrides (el engine lo hardcodea all-true); si el
 *     rol pasa a SA, los overrides existentes se limpian.
 * Overrides: semántica REPLACE — el mapa sparse enviado SUSTITUYE al anterior
 * (null = limpiar todo; ausente = no tocar). Validación zod estricta contra el
 * registry (celda desconocida → 400).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { TeamMember, TeamRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/api";
import { guardRole } from "@/lib/auth/api-guards";
import { permissionMapWriteSchema, parsePermissionMapLoose } from "@/lib/auth/permissions/schema";
import { computeEffective } from "@/lib/auth/permissions/defaults";
import { getRoleTemplate, getEffectivePermissions } from "@/lib/auth/permissions/engine";
import { revalidateTeamMembers } from "@/lib/cache/team";

type Params = { params: Promise<{ id: string }> };

const TEAM_ROLES = ["CSE", "VENTAS", "DEV", "CSL", "MARKETING", "ADMIN", "SUPER_ADMIN"] as const;

const patchSchema = z.strictObject({
  roleEnum: z.enum(TEAM_ROLES).optional(),
  canViewAllClients: z.boolean().optional(),
  // ISO string o null (limpiar). Se valida como fecha real más abajo.
  canViewAllExpiresAt: z.string().nullable().optional(),
  // REPLACE: mapa sparse validado contra el registry, o null (limpiar), o ausente (no tocar).
  permissionOverrides: permissionMapWriteSchema.nullable().optional(),
});

/** Bundle que consume el modal: fila + capas del mapa (herencia / pines / efectivo). */
async function memberBundle(member: TeamMember) {
  const template =
    member.roleEnum === "SUPER_ADMIN" ? null : await getRoleTemplate(member.roleEnum);
  return {
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      area: member.area,
      roleEnum: member.roleEnum,
      photoUrl: member.photoUrl,
      canViewAllClients: member.canViewAllClients,
      canViewAllExpiresAt: member.canViewAllExpiresAt,
    },
    // base = lo que HEREDA del rol (default ← plantilla DB), sin overrides
    base: computeEffective(member.roleEnum, template, null),
    overrides: parsePermissionMapLoose(member.permissionOverrides),
    effective: await getEffectivePermissions(member),
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardRole("SUPER_ADMIN");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const member = await prisma.teamMember.findUnique({ where: { id } });
  if (!member) return apiError("Miembro no encontrado", 404);
  return NextResponse.json(await memberBundle(member));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardRole("SUPER_ADMIN");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const member = await prisma.teamMember.findUnique({ where: { id } });
  if (!member) return apiError("Miembro no encontrado", 404);

  let body: z.infer<typeof patchSchema>;
  try {
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", message: "Permisos inválidos: hay claves fuera del catálogo o valores no booleanos.", details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return apiError("JSON inválido", 400);
  }

  const nextRole: TeamRole = body.roleEnum ?? member.roleEnum;
  const demotingSA = member.roleEnum === "SUPER_ADMIN" && nextRole !== "SUPER_ADMIN";

  // SUPER_ADMIN no lleva overrides (el engine lo hardcodea all-true).
  if (nextRole === "SUPER_ADMIN" && body.permissionOverrides) {
    return apiError("Un Super Admin no lleva overrides: siempre tiene todos los permisos.", 400);
  }

  // Fecha de expiración de la visibilidad: string ISO válida o null.
  let expiresAt: Date | null | undefined = undefined;
  if (body.canViewAllExpiresAt !== undefined) {
    if (body.canViewAllExpiresAt === null) expiresAt = null;
    else {
      const d = new Date(body.canViewAllExpiresAt);
      if (isNaN(d.getTime())) return apiError("Fecha de expiración inválida", 400);
      expiresAt = d;
    }
  }

  // Overrides con REPLACE; un mapa sin celdas pineadas se guarda como null.
  let overrides: z.infer<typeof permissionMapWriteSchema> | null | undefined =
    body.permissionOverrides;
  if (overrides) {
    const cells = Object.values(overrides.sections).reduce(
      (n, s) => n + Object.keys(s ?? {}).length,
      0,
    );
    if (cells === 0) overrides = null;
  }

  const data: Prisma.TeamMemberUpdateInput = {};
  if (body.roleEnum !== undefined) data.roleEnum = body.roleEnum;
  if (body.canViewAllClients !== undefined) data.canViewAllClients = body.canViewAllClients;
  if (expiresAt !== undefined) data.canViewAllExpiresAt = expiresAt;
  // Json?: limpiar = Prisma.DbNull (columna NULL — "hereda todo"); null/undefined no limpian.
  if (overrides !== undefined) {
    data.permissionOverrides = overrides === null ? Prisma.DbNull : (overrides as Prisma.InputJsonValue);
  }
  // Rol nuevo = SA → limpiar overrides viejos (regla de arriba; gana a lo anterior).
  if (nextRole === "SUPER_ADMIN") data.permissionOverrides = Prisma.DbNull;

  // Anti-lockout: el conteo de "otros SA activos" y el update van en una transacción
  // SERIALIZABLE — si no, dos PATCH concurrentes que degradan a los dos últimos SA leen
  // ambos otherSA=1 y dejan el sistema con 0 (TOCTOU). Serializable aborta uno de los dos.
  let updated;
  try {
    updated = await prisma.$transaction(
      async (tx) => {
        if (demotingSA) {
          const otherSA = await tx.teamMember.count({
            where: { roleEnum: "SUPER_ADMIN", deactivatedAt: null, id: { not: member.id } },
          });
          if (otherSA === 0) throw new Error("LAST_SA");
        }
        return tx.teamMember.update({ where: { id }, data });
      },
      demotingSA ? { isolationLevel: "Serializable" } : undefined,
    );
  } catch (e) {
    if (e instanceof Error && e.message === "LAST_SA") {
      return apiError("No podés dejar el sistema sin ningún Super Admin activo.", 400);
    }
    throw e;
  }
  revalidateTeamMembers();
  return NextResponse.json(await memberBundle(updated));
}
