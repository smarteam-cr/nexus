import AppShell from "@/components/layout/AppShell";
import TeamManager from "@/components/team/TeamManager";

export const metadata = { title: "Equipo" };

export default function TeamPage() {
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Equipo</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestiona los miembros del equipo que participan en las implementaciones.
          </p>
        </div>
        <TeamManager />
      </div>
    </AppShell>
  );
}
