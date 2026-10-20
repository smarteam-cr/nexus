import TeamManager from "@/components/team/TeamManager";
import { PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { puedeVerComoASuperAdmin } from "@/lib/auth/ver-como";

export const metadata = { title: "Equipo" };

export default async function TeamPage() {
  // canManage (equipo.manage, editable por plantilla) habilita subir fotos.
  // canAdminPermissions es el gate DURO de permisos: SOLO Super Admin, no
  // delegable ni por plantilla (los endpoints lo exigen igual — esto es cosmético).
  let canManage = false;
  let canAdminPermissions = false;
  // «Ver como» (lib/auth/ver-como.ts): quien mira DE VERDAD, aunque esté mirando como otra persona.
  let emailReal = "";
  try {
    const { user, teamMember, role } = await requireInternalUser();
    canManage = await can(teamMember, "equipo", "manage");
    canAdminPermissions = role === "SUPER_ADMIN";
    emailReal = (user.verComoDe?.email ?? user.email).toLowerCase();
  } catch {
    canManage = false;
  }

  return (
    /* `PageHeader` y el shell estándar, como el resto de las pantallas internas: el h1 a mano con
       `text-white` y `text-gray-500` no flipeaba a tema claro —se leía blanco sobre blanco— y
       además dejaba a Equipo con un ancho propio de 3xl que ninguna otra pantalla usa. */
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Equipo"
        description="Quién trabaja en Nexus, qué lleva y qué puede ver."
      />
      <TeamManager
        canManage={canManage}
        canAdminPermissions={canAdminPermissions}
        emailReal={emailReal}
        verComoASuperAdmin={puedeVerComoASuperAdmin(emailReal)}
      />
    </div>
  );
}
