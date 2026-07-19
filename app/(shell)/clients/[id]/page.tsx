import { requireAccessToClient } from "@/lib/auth/access";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/supabase";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { ensureStrategyProject } from "@/lib/canvas/strategy-project";
import WorkspaceClient from "./WorkspaceClient";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  try {
    await requireAccessToClient(id);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/");
    if (e instanceof ForbiddenError) redirect("/clients?error=no_access");
    throw e;
  }

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

  // SEMBRAR los canvases del proyecto inicial (patrón cobranza: server carga → client
  // siembra). Sin esto, ProjectCanvasPanel re-fetcheaba /canvases al montar y volvía a
  // pintar el WorkspaceSkeleton entero — el "segundo skeleton" que se veía tras el
  // loading.tsx. Solo aplica si el tab inicial es un proyecto REAL (el tab de
  // estrategia/procesos no usa el panel); el mismo criterio que el layout: ?tab válido
  // gana, si no el único proyecto activo.
  const tabParam = typeof sp.tab === "string" ? sp.tab : undefined;
  const initialProjectId =
    tabParam && visibleProjects.some((p) => p.id === tabParam)
      ? tabParam
      : visibleProjects.length === 1
        ? visibleProjects[0].id
        : null;
  const initialCanvases = initialProjectId
    ? (
        await prisma.projectCanvas.findMany({
          where: { projectId: initialProjectId, name: { not: "Handoff" } },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true, isDefault: true, sections: true },
        })
      ).map((c) => ({
        id: c.id,
        name: c.name,
        isDefault: c.isDefault,
        sections: (c.sections as Array<{ key: string; label: string }> | null) ?? [],
      }))
    : null;

  return (
    <WorkspaceClient
      clientId={id}
      projects={visibleProjects}
      hasHubspot={hasHubspot}
      strategyProjectId={strategyRef.projectId}
      strategyCanvasId={strategyRef.canvasId}
      initialCanvases={initialCanvases}
      initialCanvasesProjectId={initialProjectId}
    />
  );
}
