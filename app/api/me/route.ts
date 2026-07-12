import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { getEffectivePermissions } from "@/lib/auth/permissions/engine";
import { capabilitiesFromPermissions } from "@/lib/auth/permissions/compat";

/**
 * GET /api/me — usuario interno logueado: rol + permisos efectivos.
 *
 * Lo consumen componentes cliente para gating COSMÉTICO de la UI (ocultar la
 * zona de peligro, mostrar el control de compartir). La seguridad real vive en
 * cada endpoint; esto solo evita mostrar acciones que el usuario no puede ejecutar.
 *
 * `permissions` = mapa EFECTIVO sección×acción (default ← plantilla del rol en
 * DB ← overrides del usuario). `capabilities` (legacy) se DERIVA del mismo mapa
 * efectivo — los overrides por usuario se reflejan también en la UI vieja.
 */
export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const { user, teamMember, role } = guard;

  const permissions = await getEffectivePermissions(teamMember);

  return NextResponse.json({
    email: user.email,
    name: teamMember.name,
    role,
    isSuperAdmin: role === "SUPER_ADMIN",
    capabilities: capabilitiesFromPermissions(permissions),
    permissions,
  });
}
