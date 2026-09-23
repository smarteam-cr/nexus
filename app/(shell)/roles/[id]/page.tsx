/**
 * /roles/[id] — la página de UN documento de Roles (perfil de puesto o propuesta).
 *
 * Dos superficies, dos COMPONENTES distintos (no el mismo con un flag apagado):
 *  · SUPER_ADMIN → `RoleWorkspace` (toggle Editar, autosave, ✨IA, compartir).
 *  · quien lo tenga compartido → `RoleDocView`, read-only puro. El workspace lleva adentro
 *    el autosave con debounce y el flush `keepalive`, y `Editable` comitea al desmontarse:
 *    un `canEdit=false` dejaría vivo el camino de escritura y le dispararía PATCHes 403 en
 *    la cara al lector. Doctrina del repo: no existe el camino, no es un flag apagado.
 *
 * El filtro de acceso vive DENTRO de `getRole` (visibleRoleWhere): sin compartir devuelve
 * null y respondemos el MISMO 404 que si no existiera — un 403 confirmaría su existencia.
 *
 * ⚠ COMPARTIR YA NO ES LO MISMO QUE EDITAR (2026-09-23). El panel «Quién puede ver este
 * documento» se monta con `canShare` (dirección + CSL) y no con `canEdit` (solo dirección):
 * el CSL dirige quién ve el documento y publica su link público, pero sigue viendo el
 * `RoleDocView` de solo lectura. Son dos preguntas distintas y ahora tienen dos flags.
 */
import { BackLink } from "@/components/ui";
import { redirect, notFound } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { getRole } from "@/lib/roles/queries";
import { canEditRoleDocs, canShareRoleDocs } from "@/lib/roles/access";
/* El envoltorio y no el workspace: el proveedor del aplicador tiene que ser ANCESTRO del editor
   —el que provee no consume— y esta página es de servidor. Ver `RolConChat`. */
import RolConChat from "@/components/roles/RolConChat";
import RoleDocView from "@/components/roles/RoleDocView";
import RoleSharePanel from "@/components/roles/RoleSharePanel";
import { PrintDownloadButton } from "@/components/print/PrintDocButton";
import { printDocType } from "@/lib/print/doc-types";

export const dynamic = "force-dynamic";

export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");

  const { id } = await params;
  const role = await getRole(id, { role: ctx.role, teamMemberId: ctx.teamMember.id });
  if (!role) notFound();

  const canEdit = canEditRoleDocs({ role: ctx.role });
  /* EDITAR y COMPARTIR dejaron de ser el mismo permiso (2026-09-23): el CSL administra
     quién ve el documento —y publica su link— sin poder tocar el contenido. Por eso el
     panel se monta con `canShare` y el workspace sigue con `canEdit`. Los endpoints que
     consume el panel exigen lo mismo del lado del server (`guardRolesSharing`), acotado
     además a los documentos que esa persona ya puede leer. */
  const canShare = canShareRoleDocs({ role: ctx.role });

  // El PDF existe SOLO para el perfil de puesto: su adaptador arma el documento con la
  // plantilla de roles, así que una propuesta saldría sin la oferta y sin "Cómo es
  // Smarteam". El loader también lo corta (fail-closed); acá se esconde el botón para no
  // ofrecer algo que no va a salir bien. Y solo para quien edita: `authorizePrintDoc` ya
  // exige SUPER_ADMIN, pintarle el botón al lector sería prometerle un 403.
  const tipoPdf = canEdit && role.docType === "PERFIL" ? printDocType("role") : null;

  return (
    <>
      <div className="px-6 pt-6 flex items-center justify-between gap-3">
        <BackLink href="/roles">Roles</BackLink>
        {tipoPdf && <PrintDownloadButton tipo={tipoPdf} docId={role.id} />}
      </div>
      <div className="px-6 py-6 space-y-4">
        {canShare && <RoleSharePanel roleId={role.id} />}
        {canEdit ? (
          <RolConChat
            role={{
              id: role.id,
              docType: role.docType,
              title: role.title,
              area: role.area,
              summary: role.summary,
              content: role.content,
            }}
          />
        ) : (
          <RoleDocView
            docType={role.docType}
            hero={{ title: role.title, area: role.area, summary: role.summary }}
            content={role.content}
          />
        )}
      </div>
    </>
  );
}
