/**
 * /roles/[id] — la página web de UN rol (perfil de puesto). SOLO SUPER_ADMIN.
 * getRole corre DESPUÉS del gate — nada del rol entra al payload de un no-SA.
 */
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { getRole } from "@/lib/roles/queries";
import RoleWorkspace from "@/components/roles/RoleWorkspace";

export const dynamic = "force-dynamic";

export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || ctx.role !== "SUPER_ADMIN") redirect("/clients");

  const { id } = await params;
  const role = await getRole(id);
  if (!role) notFound();

  // El motor `.stl` trae su propio fondo/padding: RoleWorkspace lo renderiza dentro de
  // una card, con el toggle "Editar" (lectura ↔ edición in-situ). SOLO SUPER_ADMIN.
  return (
    <>
      <div className="px-6 pt-6">
        <Link href="/roles" className="text-sm text-fg-muted hover:text-fg">
          ← Roles
        </Link>
      </div>
      <div className="px-6 py-6">
        <RoleWorkspace
          role={{ id: role.id, title: role.title, area: role.area, summary: role.summary, content: role.content }}
        />
      </div>
    </>
  );
}
