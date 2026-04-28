import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { syncServicesForClient } from "@/lib/hubspot/sync-services";
import WorkspaceClient from "./WorkspaceClient";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const { id } = await params;

  const [client, projects, hubspotAccount] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, hubspotCompanyId: true },
    }),
    prisma.project.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        projectType: true,
        serviceType: true,
        tags: true,
        hubspotServiceId: true,
      },
    }),
    prisma.hubspotAccount.findFirst({
      where: { clientId: id },
      select: { id: true },
    }),
  ]);

  if (!client) notFound();

  // Caso 1: tiene cuenta HubSpot propia
  // Caso 2: está en el portal del sistema → tiene hubspotCompanyId
  const hasHubspot = !!hubspotAccount || !!client.hubspotCompanyId;

  // Sync server-side antes de renderizar: limpia fantasmas y actualiza estados
  // antes de que el cliente vea las tabs — evita el flash de tabs inválidas.
  if (hasHubspot) {
    await syncServicesForClient(id).catch(() => {});
  }

  // Re-leer proyectos post-sync para tener el estado actualizado
  const syncedProjects = hasHubspot
    ? await prisma.project.findMany({
        where: { clientId: id, status: "active", hubspotServiceId: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, status: true, projectType: true, serviceType: true, tags: true, hubspotServiceId: true },
      })
    : projects.filter((p) => p.status === "active");

  const visibleProjects = syncedProjects;

  return <WorkspaceClient clientId={id} projects={visibleProjects} hasHubspot={hasHubspot} />;
}
