import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AppShell from "@/components/layout/AppShell";
import Link from "next/link";
import NewAuditButton from "./NewAuditButton";
import type { LifecycleSnapshot } from "@/lib/hubspot/portal-analyzer";

export default async function AuditsPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const audits = await prisma.audit.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, data: true },
  });

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="relative flex items-center justify-between gap-8 mb-8">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Auditoría del portal</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Snapshots del estado del portal HubSpot de Smarteam con análisis generado por IA.
            </p>
          </div>
          <NewAuditButton />
        </div>

        {/* Lista */}
        {audits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">No hay auditorías aún.</p>
            <p className="text-xs text-gray-400">Creá una nueva auditoría para capturar el estado actual del portal.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {audits.map((audit) => {
              const data = audit.data as unknown as LifecycleSnapshot | null;
              const totalContacts = data?.lifecycleStats?.totalContacts ?? null;
              const totalCompanies = data?.lifecycleStats?.totalCompanies ?? null;
              const totalDeals = data?.lifecycleStats?.totalDeals ?? null;
              const hasInsights = !!(data as any)?.insights?.insights?.length;

              return (
                <Link
                  key={audit.id}
                  href={`/audits/${audit.id}`}
                  className="flex items-center justify-between px-5 py-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{audit.name}</p>
                      {hasInsights && (
                        <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-100">
                          IA
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(audit.createdAt).toLocaleDateString("es-ES", {
                        day: "numeric", month: "long", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-5 flex-shrink-0 ml-4">
                    {totalContacts !== null && (
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium text-gray-700">{totalContacts.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">contactos</p>
                      </div>
                    )}
                    {totalCompanies !== null && (
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium text-gray-700">{totalCompanies.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">empresas</p>
                      </div>
                    )}
                    {totalDeals !== null && (
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium text-gray-700">{totalDeals.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">negocios</p>
                      </div>
                    )}
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
