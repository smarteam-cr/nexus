/**
 * /roles/[id] — la página web de UN rol (perfil de puesto). SOLO SUPER_ADMIN.
 * getRole corre DESPUÉS del gate — nada del rol entra al payload de un no-SA.
 */
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { requireInternalUser } from "@/lib/auth/supabase";
import { getRole } from "@/lib/roles/queries";
import RolePage from "@/components/roles/RolePage";

export const dynamic = "force-dynamic";

export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || ctx.role !== "SUPER_ADMIN") redirect("/clients");

  const { id } = await params;
  const role = await getRole(id);
  if (!role) notFound();

  return (
    <AppShell>
      <div className="px-6 py-8">
        <div className="max-w-3xl mx-auto mb-6 flex items-center justify-between gap-4">
          <Link href="/roles" className="text-sm text-fg-muted hover:text-fg">
            ← Roles
          </Link>
          <Link
            href={`/roles?edit=${role.id}`}
            className="text-sm font-medium px-3 py-1.5 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover"
          >
            Editar
          </Link>
        </div>
        <RolePage role={role} />
      </div>
    </AppShell>
  );
}
