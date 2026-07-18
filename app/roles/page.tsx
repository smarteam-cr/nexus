/**
 * /roles — índice de perfiles de puesto del equipo. SOLO SUPER_ADMIN. El redirect
 * corta ANTES de renderizar el cliente. El CRUD y la lista viven en el cliente
 * (fetch a /api/roles, guardado por guardRolesAdmin).
 */
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import RolesIndexClient from "@/components/roles/RolesIndexClient";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || ctx.role !== "SUPER_ADMIN") redirect("/clients");

  return (
    <AppShell>
      <div className="px-6 py-8">
        <PageHeader
          title="Roles"
          description="Roles y responsabilidades del equipo. Cada puesto es una página resumida — creá, editá y abrí su documento."
        />
        <RolesIndexClient />
      </div>
    </AppShell>
  );
}
