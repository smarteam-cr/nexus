/**
 * /business-cases/[id] — workspace de un business case (por businessCaseId).
 * F2: shell mínimo (header). El panel de sesiones de contexto, la generación y el
 * editor de canvas se construyen en F3–F5. Gateado por el área de Ventas (VENTAS/DEV/CSL/SUPER_ADMIN).
 */
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { requireInternalUser } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";
import BusinessCaseWorkspace from "@/components/business-cases/BusinessCaseWorkspace";
import { isSalesAreaRole } from "@/lib/auth/sales-roles";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
};

export default async function BusinessCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isSalesAreaRole(ctx.role)) redirect("/clients");

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      publishedAt: true,
      hubspotDealId: true,
      client: { select: { name: true, isProspect: true, logoUrl: true } },
    },
  });
  if (!bc) notFound();

  return (
    <AppShell>
      <div className="px-6 py-8">
        <Link href="/business-cases" className="text-xs text-fg-muted hover:text-fg">
          ← Ventas
        </Link>
        <div className="mt-2 flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-fg truncate">{bc.name}</h1>
          <span className="flex-shrink-0 text-xs px-2 py-1 rounded bg-surface-muted text-fg-muted">
            {STATUS_LABEL[bc.status] ?? bc.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          {bc.client.name}
          {bc.client.isProspect ? " (prospecto)" : ""}
          {bc.hubspotDealId ? " · deal vinculado" : ""}
        </p>

        <div className="mt-8">
          <BusinessCaseWorkspace
            bcId={bc.id}
            clientName={bc.client.name}
            clientLogoUrl={bc.client.logoUrl}
            status={bc.status}
            publishedAt={bc.publishedAt ? bc.publishedAt.toISOString() : null}
          />
        </div>
      </div>
    </AppShell>
  );
}
