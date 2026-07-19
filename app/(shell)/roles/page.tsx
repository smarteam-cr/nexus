/**
 * /roles — índice de perfiles de puesto del equipo. SOLO SUPER_ADMIN. El redirect
 * corta ANTES de renderizar el cliente. El CRUD y la lista viven en el cliente
 * (fetch a /api/roles, guardado por guardRolesAdmin).
 */
import { redirect } from "next/navigation";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import RolesIndexClient from "@/components/roles/RolesIndexClient";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || ctx.role !== "SUPER_ADMIN") redirect("/clients");

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Roles"
        description="Roles y responsabilidades del equipo. Cada puesto es una página resumida — crea, edita y abre su documento."
      />
      <RolesIndexClient />
    </div>
  );
}
