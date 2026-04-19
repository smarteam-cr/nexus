import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
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

  // Si el cliente tiene HubSpot, mostrar solo proyectos sincronizados desde allí.
  // Si no tiene HubSpot, mostrar todos (proyectos manuales).
  const visibleProjects = hasHubspot
    ? projects.filter((p) => p.hubspotServiceId)
    : projects;

  return <WorkspaceClient clientId={id} projects={visibleProjects} hasHubspot={hasHubspot} />;
}
