import { getConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const authenticated = await getConsultantSession();
  if (authenticated) redirect("/clients");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950">
      <div className="max-w-sm w-full space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand/10 border border-brand/20">
            <svg className="w-7 h-7 text-brand-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="2.5"/>
              <circle cx="19" cy="12" r="1.5"/>
              <circle cx="15.5" cy="18.1" r="1.5"/>
              <circle cx="8.5" cy="18.1" r="1.5"/>
              <circle cx="5" cy="12" r="1.5"/>
              <circle cx="8.5" cy="5.9" r="1.5"/>
              <circle cx="15.5" cy="5.9" r="1.5"/>
              <line x1="14.5" y1="12" x2="17.5" y2="12"/>
              <line x1="13.25" y1="14.17" x2="14.75" y2="16.76"/>
              <line x1="10.75" y1="14.17" x2="9.25" y2="16.76"/>
              <line x1="9.5" y1="12" x2="6.5" y2="12"/>
              <line x1="10.75" y1="9.83" x2="9.25" y2="7.24"/>
              <line x1="13.25" y1="9.83" x2="14.75" y2="7.24"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Nexus
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Acceso exclusivo para consultores
            </p>
          </div>
        </div>

        {/* Botón HubSpot */}
        <a
          href="/api/auth/hubspot?system=1"
          className="flex items-center justify-center gap-3 w-full px-6 py-3.5 rounded-xl bg-brand hover:bg-brand-light text-white font-semibold text-sm transition-colors shadow-lg shadow-brand/20"
        >
          Continuar con HubSpot
        </a>

        <p className="text-center text-xs text-gray-600">
          Solo consultores autorizados pueden acceder a este workspace.
        </p>
      </div>
    </main>
  );
}
