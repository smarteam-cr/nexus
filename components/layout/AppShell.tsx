import { getConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getClientsForSidebar } from "@/lib/cache/clients";
import SidebarShell from "./SidebarShell";

export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const authenticated = await getConsultantSession();
  if (!authenticated) redirect("/");

  // Cacheado (ver lib/cache/clients.ts). Mutaciones de Client llaman
  // revalidateTag("clients-sidebar") para invalidar.
  const clients = await getClientsForSidebar();

  return <SidebarShell clients={clients}>{children}</SidebarShell>;
}
