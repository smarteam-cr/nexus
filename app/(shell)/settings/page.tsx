import { requireConsultantSession } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ThemeToggle from "@/components/layout/ThemeToggle";

export default async function SettingsPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const initialTheme = (await cookies()).get("nexus-theme")?.value === "dark" ? "dark" : "light";

  return (
    <div className="flex-1 px-8 py-8 space-y-6 overflow-y-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Configuración</h1>
        <p className="text-gray-500 text-sm mt-0.5">Configuración global del workspace</p>
      </div>

      {/* Session */}
      <div className="p-5 rounded-xl bg-gray-900 border border-gray-800 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-brand-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <p className="text-white font-medium">Sesión del consultor</p>
            <p className="text-gray-500 text-sm">Sesión activa</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-green-400 text-sm">Activa</span>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-4">
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-sm transition-colors"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>

      {/* Apariencia */}
      <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-medium">Apariencia</p>
              <p className="text-gray-500 text-sm">Alternar entre modo oscuro y claro</p>
            </div>
          </div>
          <ThemeToggle initialTheme={initialTheme} />
        </div>
      </div>

      {/* About */}
      <div className="p-5 rounded-xl bg-gray-900 border border-gray-800 space-y-3">
        <p className="text-white font-medium">Acerca del Workspace de Consultoría IA</p>
        <p className="text-gray-500 text-sm leading-relaxed">
          Workspace para gestionar el proceso de transformación IA de múltiples clientes,
          desde el diagnóstico inicial hasta la habilitación del CRM y el entrenamiento del equipo.
        </p>
        <div className="flex gap-4 text-xs text-gray-600">
          <span>Versión 0.2.0</span>
          <span>·</span>
          <span>Powered by Claude AI</span>
        </div>
      </div>
    </div>
  );
}
