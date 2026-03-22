import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";

export default async function DashboardPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  return (
    <AppShell>
      <main className="flex-1 px-8 py-8">
        <div className="max-w-2xl">
          <h1 className="text-xl font-bold text-white mb-1">Insights cross-cliente</h1>
          <p className="text-gray-500 text-sm">
            Próximamente: métricas y resúmenes agregados de todos tus clientes.
          </p>
        </div>

        <div className="mt-12 flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-4">
            <svg
              className="w-6 h-6 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p className="text-white font-medium">En construcción</p>
          <p className="text-gray-500 text-sm mt-1 max-w-xs">
            Aquí verás métricas agregadas, progreso de cada cliente y alertas importantes.
          </p>
        </div>
      </main>
    </AppShell>
  );
}
