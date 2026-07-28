/**
 * /roles/[id] — la página web de UN rol (perfil de puesto). SOLO SUPER_ADMIN.
 * getRole corre DESPUÉS del gate — nada del rol entra al payload de un no-SA.
 */
import { BackLink } from "@/components/ui";
import { redirect, notFound } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { getRole } from "@/lib/roles/queries";
import RoleWorkspace from "@/components/roles/RoleWorkspace";
import { PrintDownloadButton } from "@/components/print/PrintDocButton";
import { printDocType } from "@/lib/print/doc-types";

export const dynamic = "force-dynamic";

export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || ctx.role !== "SUPER_ADMIN") redirect("/clients");

  const { id } = await params;
  const role = await getRole(id);
  if (!role) notFound();

  const tipoPdf = printDocType("role");

  // El motor `.stl` trae su propio fondo/padding: RoleWorkspace lo renderiza dentro de
  // una card, con el toggle "Editar" (lectura ↔ edición in-situ). SOLO SUPER_ADMIN.
  return (
    <>
      <div className="px-6 pt-6 flex items-center justify-between gap-3">
        <BackLink href="/roles">Roles</BackLink>
        {/* El perfil se imprime con el mismo motor con el que se ve: `printDocType` devuelve
            null mientras el tipo no esté prendido en el registro, y entonces no hay botón. */}
        {tipoPdf && <PrintDownloadButton tipo={tipoPdf} docId={role.id} />}
      </div>
      <div className="px-6 py-6">
        <RoleWorkspace
          role={{ id: role.id, title: role.title, area: role.area, summary: role.summary, content: role.content }}
        />
      </div>
    </>
  );
}
