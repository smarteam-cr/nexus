import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AppShell from "@/components/layout/AppShell";
import NewAuditButton from "./NewAuditButton";
import AuditsTable, { type AuditRow } from "./AuditsTable";
import { PageHeader, EmptyState } from "@/components/ui";
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

  // Extraer filas livianas server-side — el JSON pesado de `data` no cruza al cliente.
  const rows: AuditRow[] = audits.map((audit) => {
    const data = audit.data as unknown as LifecycleSnapshot | null;
    return {
      id: audit.id,
      name: audit.name,
      createdAt: audit.createdAt.toISOString(),
      totalContacts: data?.lifecycleStats?.totalContacts ?? null,
      totalCompanies: data?.lifecycleStats?.totalCompanies ?? null,
      totalDeals: data?.lifecycleStats?.totalDeals ?? null,
      hasInsights: !!(data as any)?.insights?.insights?.length,
    };
  });

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <PageHeader
          title="Auditoría del portal"
          description="Snapshots del estado del portal HubSpot de Smarteam con análisis generado por IA."
        />

        {rows.length === 0 ? (
          <EmptyState
            variant="dashed"
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            }
            title="No hay auditorías aún"
            description="Creá una nueva auditoría para capturar el estado actual del portal HubSpot."
            action={<NewAuditButton />}
          />
        ) : (
          <AuditsTable audits={rows} />
        )}
      </div>
    </AppShell>
  );
}
