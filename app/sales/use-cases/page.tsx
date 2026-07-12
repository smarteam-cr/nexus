/**
 * /sales/use-cases — administración del catálogo de casos de uso (Ventas).
 * Cada caso: título + descripción + precio (texto) + tipos de BC a los que aplica
 * + tags + activo. Los vendedores los marcan por BC en el workspace (checklist).
 * Gateado por el área de Ventas (VENTAS/DEV/CSL/SUPER_ADMIN).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import UseCasesAdminClient from "./UseCasesAdminClient";

export const dynamic = "force-dynamic";

export default async function UseCasesAdminPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");

  return (
    <AppShell>
      <div className="px-6 py-8 max-w-3xl">
        <Link href="/business-cases" className="text-xs text-fg-muted hover:text-fg">
          ← Ventas
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-fg">Catálogo de casos de uso</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Casos de uso pre-armados con precio. El vendedor los marca por business case y entran
          a la propuesta con el texto y precio exactos de acá. Sin catálogo, el flujo sigue igual.
        </p>
        <div className="mt-6">
          <UseCasesAdminClient />
        </div>
      </div>
    </AppShell>
  );
}
