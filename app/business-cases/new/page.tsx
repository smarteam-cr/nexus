/**
 * /business-cases/new — crear un business case sobre una empresa de HubSpot
 * (stepper on-page). Gateado por el área de Ventas (VENTAS/DEV/CSL/SUPER_ADMIN).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import BusinessCaseStepper from "@/components/business-cases/BusinessCaseStepper";
import { isSalesAreaRole } from "@/lib/auth/sales-roles";

export const dynamic = "force-dynamic";

export default async function NewBusinessCasePage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isSalesAreaRole(ctx.role)) redirect("/clients");

  return (
    <AppShell>
      <div className="px-6 py-8">
        <Link href="/business-cases" className="text-xs text-fg-muted hover:text-fg">
          ← Ventas
        </Link>
        <PageHeader title="Nuevo business case" description="Buscá la empresa en HubSpot para arrancar." />
        <div className="mt-6">
          <BusinessCaseStepper />
        </div>
      </div>
    </AppShell>
  );
}
