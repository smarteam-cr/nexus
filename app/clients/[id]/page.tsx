import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { ensureStrategyProject } from "@/lib/canvas/strategy-project";
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

  const hasHubspot = !!hubspotAccount || !!client.hubspotCompanyId;

  // Solo mostrar proyectos activos con datos reales. Excluir el proyecto de estrategia
  // (__strategy__) que se gestiona aparte y nunca va como tab regular.
  const visibleProjects = hasHubspot
    ? projects.filter((p) => p.hubspotServiceId && p.status === "active" && p.serviceType !== "__strategy__")
    : projects.filter((p) => p.status === "active" && p.serviceType !== "__strategy__");

  // Garantizar que el proyecto de estrategia existe (se crea al primer acceso)
  const strategyRef = await ensureStrategyProject(id);

  return (
    <WorkspaceClient
      clientId={id}
      clientName={client.name}
      projects={visibleProjects}
      hasHubspot={hasHubspot}
      strategyProjectId={strategyRef.projectId}
      strategyCanvasId={strategyRef.canvasId}
    />
  );
}
