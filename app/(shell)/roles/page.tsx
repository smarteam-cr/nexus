/**
 * /roles — índice de los documentos de Roles: perfiles de puesto Y propuestas.
 *
 * Ya NO es un redirect para todo no-SUPER_ADMIN: quien tenga un documento COMPARTIDO entra
 * acá a leerlo. Lo que decide qué ve cada quien es `visibleRoleWhere` (dentro del GET de
 * /api/roles); lo que decide si puede TOCAR algo es `canEditRoleDocs`, que baja como
 * `canEdit` y apaga el alta, el activar/desactivar y el borrar.
 *
 * Sin sesión interna sí seguimos redirigiendo: esta ruta no tiene nada que ofrecerle.
 */
import { redirect } from "next/navigation";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { canEditRoleDocs } from "@/lib/roles/access";
import RolesIndexClient from "@/components/roles/RolesIndexClient";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  const canEdit = canEditRoleDocs({ role: ctx.role });

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Roles"
        description={
          canEdit
            ? "Perfiles de puesto del equipo y propuestas de contratación. Cada documento es una página propia — crea, edita y compártela."
            : "Los documentos que dirección compartió contigo."
        }
      />
      <RolesIndexClient canEdit={canEdit} />
    </div>
  );
}
