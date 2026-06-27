/**
 * /business-cases — hub del área de Ventas. Lista los clientes accesibles; cada
 * uno lleva a sus business cases. Gateado por rol VENTAS/CSL/SUPER_ADMIN.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { accessibleClientWhere } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const SALES_ROLES = ["VENTAS", "CSL", "SUPER_ADMIN"];

export default async function BusinessCasesHubPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !SALES_ROLES.includes(ctx.role)) redirect("/clients");

  const where = await accessibleClientWhere(ctx.user);
  const clients = await prisma.client.findMany({
    where: where ?? undefined,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      company: true,
      _count: { select: { businessCases: true } },
    },
  });

  return (
    <AppShell>
      <div className="px-6 py-8">
        <PageHeader
          title="Ventas — Business Cases"
          description="Generá y publicá casos de negocio para tus prospectos."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/business-cases/${c.id}`}
              className="rounded-2xl border border-line bg-surface p-5 hover:border-brand/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg truncate">{c.name}</h3>
                <span className="flex-shrink-0 text-xs text-fg-muted">
                  {c._count.businessCases} caso{c._count.businessCases === 1 ? "" : "s"}
                </span>
              </div>
              {c.company && <p className="mt-1 text-xs text-fg-muted truncate">{c.company}</p>}
            </Link>
          ))}
          {clients.length === 0 && (
            <p className="text-sm text-fg-muted">No hay clientes disponibles.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
