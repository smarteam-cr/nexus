/**
 * /business-cases — hub del área de Ventas: lista todos los business cases
 * (prospectos y clientes) + "Nuevo". Gateado por el área de Ventas (VENTAS/DEV/CSL/SUPER_ADMIN).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { requireInternalUser } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";
import DeleteBusinessCaseButton from "@/components/business-cases/DeleteBusinessCaseButton";
import { isSalesAreaRole } from "@/lib/auth/sales-roles";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
};

export default async function BusinessCasesHubPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isSalesAreaRole(ctx.role)) redirect("/clients");

  const cases = await prisma.businessCase.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      client: { select: { name: true, isProspect: true } },
    },
  });

  return (
    <AppShell>
      <div className="px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-fg">Ventas — Business Cases</h1>
            <p className="mt-1 text-sm text-fg-muted">Casos de negocio para prospectos y clientes.</p>
          </div>
          <Link
            href="/business-cases/new"
            className="flex-shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Nuevo business case
          </Link>
        </div>

        <div className="mt-6 space-y-2">
          {cases.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 hover:border-brand/40 transition-colors"
            >
              <Link
                href={`/business-cases/${c.id}`}
                className="flex flex-1 items-center justify-between gap-3 min-w-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{c.name}</p>
                  <p className="text-xs text-fg-muted truncate">
                    {c.client.name}
                    {c.client.isProspect ? " (prospecto)" : ""}
                  </p>
                </div>
                <span className="flex-shrink-0 text-xs px-2 py-1 rounded bg-surface-muted text-fg-muted">
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </Link>
              <DeleteBusinessCaseButton
                bcId={c.id}
                description={`Se eliminará "${c.name}" (${c.client.name}) con todos sus casos de uso, secciones y contenido. Esta acción no se puede deshacer.`}
              />
            </div>
          ))}
          {cases.length === 0 && (
            <p className="text-sm text-fg-muted">No hay business cases todavía. Creá el primero.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
