/**
 * /business-cases — hub del área de Ventas: lista todos los business cases
 * (prospectos y clientes) + "Nuevo". Gateado por el área de Ventas (VENTAS/DEV/CSL/SUPER_ADMIN).
 */
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import Link from "next/link";
import { requireInternalUser } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";
import DeleteBusinessCaseButton from "@/components/business-cases/DeleteBusinessCaseButton";
import { can } from "@/lib/auth/permissions/engine";
import { resolveBcType } from "@/lib/business-cases/case-types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
};

export default async function BusinessCasesHubPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");

  const cases = await prisma.businessCase.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      caseType: true,
      client: { select: { name: true, isProspect: true } },
    },
  });

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Ventas — Business Cases"
        description="Casos de negocio para prospectos y clientes."
        action={
          <div className="flex items-center gap-3">
            <Link href="/sales/use-cases" className="text-xs text-fg-muted hover:text-fg">
              Catálogo de casos de uso
            </Link>
            <Link
              href="/business-cases/new"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
            >
              Nuevo business case
            </Link>
          </div>
        }
      />

      <div className="space-y-2">
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
              <span className="flex-shrink-0 flex items-center gap-1.5">
                <span className="text-[11px] px-2 py-1 rounded border border-line text-fg-muted">
                  {resolveBcType(c.caseType).shortLabel}
                </span>
                <span className="text-xs px-2 py-1 rounded bg-surface-muted text-fg-muted">
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
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
  );
}
