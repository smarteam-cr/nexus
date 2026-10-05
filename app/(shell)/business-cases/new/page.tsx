/**
 * /business-cases/new — crear una propuesta sobre una empresa de HubSpot, con o sin preventa
 * (components/propuestas/NuevaPropuesta.tsx). Gateado por `ventas.read`.
 */
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import NuevaPropuesta from "@/components/propuestas/NuevaPropuesta";
import { can } from "@/lib/auth/permissions/engine";

export const dynamic = "force-dynamic";

export default async function NuevaPropuestaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");

  return (
    <div className="px-6 py-8">
      <div className="mx-auto max-w-[760px]">
        <PageHeader
          title="Nueva propuesta"
          description="Busca la empresa en HubSpot, elige qué se cotiza y ponle nombre. El contexto se arma después, en la ficha."
          backHref="/business-cases"
          backLabel="Propuestas"
        />
      </div>
      <NuevaPropuesta />
    </div>
  );
}
