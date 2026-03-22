import { getConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import SidebarShell from "./SidebarShell";

export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const authenticated = await getConsultantSession();
  if (!authenticated) redirect("/");

  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      company: true,
      hubspotAccount: { select: { id: true, hubName: true } },
    },
  });

  return <SidebarShell clients={clients}>{children}</SidebarShell>;
}
