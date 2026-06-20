import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { capabilitiesFor } from "@/lib/auth/roles";

/**
 * GET /api/me — usuario interno logueado: rol + capacidades.
 *
 * Lo consumen componentes cliente para gating COSMÉTICO de la UI (ocultar la
 * zona de peligro, mostrar el control de compartir). La seguridad real vive en
 * cada endpoint; esto solo evita mostrar acciones que el rol no puede ejecutar.
 */
export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const { user, teamMember, role } = guard;

  return NextResponse.json({
    email: user.email,
    name: teamMember.name,
    role,
    isSuperAdmin: role === "SUPER_ADMIN",
    capabilities: capabilitiesFor(role),
  });
}
