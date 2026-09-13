/**
 * /cobranza/importar — wizard del importador CSV de cuentas (AccountSource
 * "sheet"): subir → mapear → revisar → aplicar. Mismo gate que /cobranza
 * (whitelist client-safe COBRANZA_ROLES; el enforcement real vive en
 * guardCobranzaAccess en los endpoints /api/cobranza/import/**).
 */
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import ImportWizard from "@/components/cobranza/ImportWizard";

export const dynamic = "force-dynamic";

export default async function ImportarCobranzaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Importar cuentas y comparar el libro"
        description="Subí el CSV del sheet de Finanzas para cargar cuentas, o el libro de Alex (.xlsx) para ver fila por fila qué no coincide con Nexus, sin escribir nada."
      />
      <ImportWizard />
    </div>
  );
}
