import AppShell from "@/components/layout/AppShell";
import TeamManager from "@/components/team/TeamManager";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";

export const metadata = { title: "Equipo" };

export default async function TeamPage() {
  // canManage (equipo.manage, editable por plantilla) habilita subir fotos.
  // canAdminPermissions es el gate DURO de permisos: SOLO Super Admin, no
  // delegable ni por plantilla (los endpoints lo exigen igual — esto es cosmético).
  let canManage = false;
  let canAdminPermissions = false;
  try {
    const { teamMember, role } = await requireInternalUser();
    canManage = await can(teamMember, "equipo", "manage");
    canAdminPermissions = role === "SUPER_ADMIN";
  } catch {
    canManage = false;
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Equipo</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestiona los miembros del equipo que participan en las implementaciones.
          </p>
        </div>
        <TeamManager canManage={canManage} canAdminPermissions={canAdminPermissions} />
      </div>
    </AppShell>
  );
}
