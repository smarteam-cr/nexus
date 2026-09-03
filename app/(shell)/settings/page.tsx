/**
 * app/(shell)/settings/page.tsx — LAS PREFERENCIAS DE QUIEN MIRA, Y NADA MÁS.
 *
 * ── POR QUÉ ENCOGIÓ ──────────────────────────────────────────────────────────────────────────
 * Había DOS «Configuración» en pantalla al mismo tiempo: una en el menú lateral y otra en el menú
 * del avatar, con destinos distintos. Elías lo vio en una captura, y el problema no era el rótulo
 * repetido sino que las dos cosas no son de la misma clase: una es la CONFIGURACIÓN DEL SISTEMA
 * —lo que Nexus conecta con el mundo, compartido por todos— y la otra son LAS PREFERENCIAS DE
 * ESTA PERSONA. Mezcladas, cada quien probaba las dos entradas cada vez.
 *
 * Así que el sistema se fue a `/integrations` (que ya existía y ya tenía HubSpot, Google y Claude)
 * y acá quedó lo único que es de quien mira: el tema.
 *
 * ── LO QUE SE FUE, Y ADÓNDE ──────────────────────────────────────────────────────────────────
 *  · Odoo         → `/integrations/odoo` (mismo gate: SOLO SUPER_ADMIN)
 *  · Gasto en IA  → `/integrations/gasto-ia` (ídem)
 *  · «Acerca del Workspace» (la versión) → `/integrations`, que es donde vive lo del sistema.
 *  · ⛔ «Cerrar sesión» NO se migró: posteaba a `/api/auth/logout`, una ruta que NO EXISTE en el
 *    repo — el botón estaba muerto. El que funciona es el del menú del avatar (`/auth/signout`),
 *    y está a dos clics de acá. Migrar un botón roto habría sido mudar el bug de lugar.
 *
 * ⚠ Esta pantalla no pide ningún permiso, y está bien: elegir el tema no es una capacidad.
 */
import { requireConsultantSession } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import ThemeToggle from "@/components/layout/ThemeToggle";

export default async function SettingsPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const initialTheme = (await cookies()).get("nexus-theme")?.value === "dark" ? "dark" : "light";

  return (
    <div className={`flex-1 overflow-y-auto ${SHELL_DEFAULT}`}>
      <PageHeader
        title="Preferencias"
        description="Cómo se ve Nexus para vos. No afecta a nadie más del equipo."
      />

      <div className="max-w-2xl">
        <section className="rounded-xl bg-surface border border-line p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-muted border border-line flex items-center justify-center shrink-0">
                <svg
                  className="w-5 h-5 text-fg-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-fg font-medium">Apariencia</p>
                <p className="text-fg-muted text-sm">Alternar entre modo oscuro y claro.</p>
              </div>
            </div>
            <ThemeToggle initialTheme={initialTheme} />
          </div>
        </section>
      </div>
    </div>
  );
}
