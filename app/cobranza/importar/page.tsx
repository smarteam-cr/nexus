/**
 * /cobranza/importar — wizard del importador CSV de cuentas (AccountSource
 * "sheet"): subir → mapear → revisar → aplicar. Mismo gate que /cobranza
 * (whitelist client-safe COBRANZA_ROLES; el enforcement real vive en
 * guardCobranzaAccess en los endpoints /api/cobranza/import/**).
 */
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import ImportWizard from "@/components/cobranza/ImportWizard";

export const dynamic = "force-dynamic";

export default async function ImportarCobranzaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");

  return (
    <AppShell>
      <div className="px-6 py-8">
        <PageHeader
          title="Importar cuentas"
          description="Subí el CSV del sheet de Finanzas, revisá el mapeo y las filas, y aplicá la importación."
        />
        <ImportWizard />
      </div>
    </AppShell>
  );
}
