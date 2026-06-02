import { redirect } from "next/navigation";
import { getClientsForSidebar } from "@/lib/cache/clients";
import { requireUser, UnauthorizedError } from "@/lib/auth/supabase";
import SidebarShell from "./SidebarShell";

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

  // Info compacta para el avatar del sidebar
  const userLite = {
    email: user.email,
    name: user.teamMember?.name ?? user.email,
    role: user.teamMember?.roleEnum ?? null,
    isSuperAdmin: user.teamMember?.roleEnum === "SUPER_ADMIN",
  };

  return (
    <SidebarShell clients={clients} user={userLite}>
      {children}
    </SidebarShell>
  );
}
