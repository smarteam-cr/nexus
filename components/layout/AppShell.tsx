import { redirect } from "next/navigation";
import { getClientsForSidebar } from "@/lib/cache/clients";
import { requireUser, UnauthorizedError } from "@/lib/auth/supabase";
import { getEffectivePermissions } from "@/lib/auth/permissions/engine";
import type { PermissionMap } from "@/lib/auth/permissions/types";
import SidebarShell from "./SidebarShell";
import CsAlertNotifier from "@/components/cs/CsAlertNotifier";

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

  // Cacheado (ver lib/cache/clients.ts). Mutaciones de Client llaman
  // revalidateTag("clients-sidebar") para invalidar.
  const clients = await getClientsForSidebar();

  // Permisos EFECTIVOS (default ← plantilla del rol ← overrides) — se resuelven
  // acá en el server y bajan al Sidebar (sin fetch extra ni flash en el cliente).
  // Sin TeamMember (EXTERNAL/edge) → mapa vacío: solo los ítems universales.
  const permissions: PermissionMap = user.teamMember
    ? await getEffectivePermissions(user.teamMember)
    : { v: 1, sections: {} };

  // Info compacta para el avatar del sidebar + gating de navegación.
  const userLite = {
    email: user.email,
    name: user.teamMember?.name ?? user.email,
    role: user.teamMember?.roleEnum ?? null,
    isSuperAdmin: user.teamMember?.roleEnum === "SUPER_ADMIN",
    permissions,
  };

  return (
    <SidebarShell clients={clients} user={userLite}>
      {/* Alertas HIGH del watchdog CS → notificación de navegador. Solo CSL/SUPER_ADMIN
          (el componente se auto-apaga para otros roles; render null). */}
      <CsAlertNotifier role={userLite.role} />
      {children}
    </SidebarShell>
  );
}
