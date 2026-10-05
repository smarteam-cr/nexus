import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser, UnauthorizedError } from "@/lib/auth/supabase";
import { getEffectivePermissions } from "@/lib/auth/permissions/engine";
import { esAdminDeRoles, hasSharedRoleDocs } from "@/lib/roles/access";
import type { PermissionMap } from "@/lib/auth/permissions/types";
import { vistaFinanzasDe } from "@/lib/finanzas/vista";
import SidebarShell from "./SidebarShell";
import CsAlertNotifier from "@/components/cs/CsAlertNotifier";
import { TooltipLayer } from "@/components/ui/Tooltip";
import AgentRunsProvider from "@/components/ai/AgentRunsProvider";
import RecorridosProvider from "@/components/recorridos/RecorridosProvider";
import { COOKIE_DE_RECORRIDOS } from "@/lib/recorridos/vistos";
import FeedbackProvider from "@/components/feedback/FeedbackProvider";

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
    isSuperAdmin || !user.teamMember
      ? false
      : /* El CSL administra la sección entera desde 2026-09-23: entra por ROL, no por tener
           algo compartido. Sin esto, un CSL sin shares no vería el ítem y tampoco podría
           crear el primer documento — la pantalla sería inalcanzable. Se evalúa ANTES que la
           query para no pagarla. */
        esAdminDeRoles({ role: user.teamMember.roleEnum }) ||
        (await hasSharedRoleDocs(user.teamMember.id));

  // Info compacta para el avatar del sidebar + gating de navegación.
  const userLite = {
    email: user.email,
    name: user.teamMember?.name ?? user.email,
    role: user.teamMember?.roleEnum ?? null,
    isSuperAdmin,
    permissions,
    hasSharedDocs,
    // El panel de Finanzas de esta persona (rediseño 2026-10-03): sale de su fila, sin consulta extra.
    vistaFinanzas: vistaFinanzasDe({
      roleEnum: user.teamMember?.roleEnum,
      vistaFinanzas: user.teamMember?.vistaFinanzas,
    }),
  };

  // Ancho del sidebar resuelto en SSR (mismo mecanismo que la cookie nexus-theme):
  // el primer paint ya nace con el ancho correcto — sin flash ni salto post-hidratación.
  const cookieStore = await cookies();
  const sidebarCollapsed = cookieStore.get("nexus-sidebar")?.value === "collapsed";
  // Qué recorridos guiados vio (mismo mecanismo): el punto azul de «Recorrido» nace bien pintado.
  const recorridosVistos = cookieStore.get(COOKIE_DE_RECORRIDOS)?.value ?? null;

  return (
    // El provider envuelve al shell ENTERO (sidebar incluido): el ítem "Corridas de
    // agentes" consume el mismo feed que dispara los avisos, y al vivir en el layout
    // del route-group el seguimiento sobrevive a navegar entre secciones.
    <AgentRunsProvider>
      {/* Los recorridos guiados: el ítem «Recorridos» del menú del avatar y el botón de cada
          cabecera leen el mismo estado, así que también envuelve al sidebar. */}
      <RecorridosProvider rol={userLite.role} vistosIniciales={recorridosVistos}>
        {/* Feedback desde cualquier pantalla (2026-10-04): el botón vive en el pie del menú y el panel
            no se desmonta al navegar. Va con la versión que corre, para saber qué estaba viendo la persona. */}
        <FeedbackProvider version={process.env.GIT_SHA?.slice(0, 7) ?? null}>
        <SidebarShell user={userLite} initialOpen={!sidebarCollapsed}>
          {/* Alertas HIGH del watchdog CS → notificación de navegador. Solo CSL/SUPER_ADMIN
              (el componente se auto-apaga para otros roles; render null). */}
          <CsAlertNotifier role={userLite.role} />
          {/* LA capa de ayuda. Va UNA vez y acá: adopta el `title` de cualquier elemento de
              la app —incluidos los que todavía no existen— y lo pinta con el tema en vez de
              dejar que lo pinte el sistema operativo. Ver components/ui/Tooltip.tsx. */}
          <TooltipLayer />
          {children}
        </SidebarShell>
        </FeedbackProvider>
      </RecorridosProvider>
    </AgentRunsProvider>
  );
}
