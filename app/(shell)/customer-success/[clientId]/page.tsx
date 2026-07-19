import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireCapability } from "@/lib/auth/roles";
import { accessibleClientWhere } from "@/lib/auth/access";
import { loadCsAccount } from "@/lib/cs/load-account";
import AccountView from "@/components/cs/account/AccountView";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

// VISTA POR CUENTA de Customer Success: estado completo de UNA cuenta (proyectos,
// alertas, cronograma, licencias, adopción, resumen citado). Mismo gate que el
// panel (seeAllClients); si el cliente no pasa el where del usuario → 404.
export default async function CustomerSuccessAccountPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requireCapability("seeAllClients").catch(() => null);
  if (!ctx) redirect("/clients");

  const where = await accessibleClientWhere(ctx.user);
  // Uso/UUS/MRR de partner: confidenciales — solo CSL y SUPER_ADMIN.
  const role = ctx.user.teamMember?.roleEnum ?? null;
  const canSeePartnerData = role === "CSL" || role === "SUPER_ADMIN";
  const data = await loadCsAccount(clientId, where, canSeePartnerData);
  if (!data) notFound();

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        backHref="/customer-success"
        backLabel="Éxito del cliente"
        title={data.clientCompany || data.clientName}
        description={`${data.projects.length} proyecto${data.projects.length !== 1 ? "s" : ""} activo${data.projects.length !== 1 ? "s" : ""}${data.alerts.length > 0 ? ` · ${data.alerts.length} alerta${data.alerts.length !== 1 ? "s" : ""} vigente${data.alerts.length !== 1 ? "s" : ""}` : ""}`}
      />
      <AccountView data={data} />
    </div>
  );
}
