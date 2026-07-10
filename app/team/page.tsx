import AppShell from "@/components/layout/AppShell";
import TeamManager from "@/components/team/TeamManager";
import { requireInternalUser } from "@/lib/auth/supabase";
import { hasCapability } from "@/lib/auth/roles";

export const metadata = { title: "Equipo" };

export default async function TeamPage() {
  // Solo quien puede gestionar el equipo (SUPER_ADMIN) sube fotos desde acá.
  let canManage = false;
  try {
    const { role } = await requireInternalUser();
    canManage = hasCapability(role, "manageTeam");
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
        <TeamManager canManage={canManage} />
      </div>
    </AppShell>
  );
}
