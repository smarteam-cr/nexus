import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser, UnauthorizedError } from "@/lib/auth/supabase";
import { getEffectivePermissions } from "@/lib/auth/permissions/engine";
import { hasSharedRoleDocs } from "@/lib/roles/access";
import type { PermissionMap } from "@/lib/auth/permissions/types";
import SidebarShell from "./SidebarShell";
import CsAlertNotifier from "@/components/cs/CsAlertNotifier";
import AgentRunsProvider from "@/components/ai/AgentRunsProvider";

export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  // Identidad del usuario logueado (Supabase Auth + AppUser).
  // Si no hay sesión, redirect a la landing (esto duplica el middleware pero
  // protege Server Components que se rendericen antes que él).
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/");
    throw e;
  }

  // Permisos EFECTIVOS (default ← plantilla del rol ← overrides) — se resuelven
  // acá en el server y bajan al Sidebar (sin fetch extra ni flash en el cliente).
  // Sin TeamMember (EXTERNAL/edge) → mapa vacío: solo los ítems universales.
  const permissions: PermissionMap = user.teamMember
    ? await getEffectivePermissions(user.teamMember)
    : { v: 1, sections: {} };

  const isSuperAdmin = user.teamMember?.roleEnum === "SUPER_ADMIN";

  /* ¿Le compartieron algún documento de Roles? Es lo único que enciende ese ítem del menú
     para quien no es dirección. Se paga SOLO si hace falta: para un SUPER_ADMIN la respuesta
     es sí por definición, y sin TeamMember no hay a quién compartirle. La query es un
     `findFirst` por índice — este archivo corre en CADA navegación y en 2026-07 se sacó de
     acá `getClientsForSidebar` justo por ser el query más caliente del proyecto. */
  const hasSharedDocs =
    isSuperAdmin || !user.teamMember ? false : await hasSharedRoleDocs(user.teamMember.id);

  // Info compacta para el avatar del sidebar + gating de navegación.
  const userLite = {
    email: user.email,
    name: user.teamMember?.name ?? user.email,
    role: user.teamMember?.roleEnum ?? null,
    isSuperAdmin,
    permissions,
    hasSharedDocs,
  };

  // Ancho del sidebar resuelto en SSR (mismo mecanismo que la cookie nexus-theme):
  // el primer paint ya nace con el ancho correcto — sin flash ni salto post-hidratación.
  const sidebarCollapsed = (await cookies()).get("nexus-sidebar")?.value === "collapsed";

  return (
    // El provider envuelve al shell ENTERO (sidebar incluido): el ítem "Corridas de
    // agentes" consume el mismo feed que dispara los avisos, y al vivir en el layout
    // del route-group el seguimiento sobrevive a navegar entre secciones.
    <AgentRunsProvider>
      <SidebarShell user={userLite} initialOpen={!sidebarCollapsed}>
        {/* Alertas HIGH del watchdog CS → notificación de navegador. Solo CSL/SUPER_ADMIN
            (el componente se auto-apaga para otros roles; render null). */}
        <CsAlertNotifier role={userLite.role} />
        {children}
      </SidebarShell>
    </AgentRunsProvider>
  );
}
