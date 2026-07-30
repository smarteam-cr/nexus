import { requireAccessToClient } from "@/lib/auth/access";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/supabase";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { ensureStrategyProject } from "@/lib/canvas/strategy-project";
import { esProyectoNavegable } from "@/lib/projects/scope";
import WorkspaceClient, { type SeededCanvas } from "./WorkspaceClient";
import { canvasNotOf, onlyEnabled } from "@/lib/pieces/canvas-query";
import { loadCanvasesConContenido } from "@/lib/pieces/piece-content";
import { piezaDesactualizadaPorHandoff } from "@/lib/pieces/piece-staleness";

/**
 * Los canvases del proyecto inicial, CON su señal de contenido. La señal viaja desde el
 * primer pintado a propósito: sin ella todas las filas del desplegable arrancaban
 * "vacía" (ámbar) y el CTA salía "Generar" sólido sobre piezas llenas, hasta que llegaba
 * el refetch del listado y todo saltaba de estado. El criterio es UNO solo
 * (lib/pieces/piece-content.ts), el mismo que usa /api/projects/[id]/canvases.
 */
async function seedCanvases(projectId: string): Promise<SeededCanvas[]> {
  const canvases = await prisma.projectCanvas.findMany({
    where: { projectId, ...canvasNotOf("handoff"), ...onlyEnabled },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, slug: true, name: true, isDefault: true, sections: true, contentUpdatedAt: true },
  });
  const [conContenido, proyecto] = await Promise.all([
    loadCanvasesConContenido(projectId, canvases),
    // Misma señal de vejez que /api/projects/[id]/canvases: si una sola la calculara, la
    // fila arrancaría sin aviso y lo estrenaría al llegar el refetch.
    prisma.project.findUnique({ where: { id: projectId }, select: { handoffGeneratedAt: true } }),
  ]);
  return canvases.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    isDefault: c.isDefault,
    sections: (c.sections as Array<{ key: string; label: string }> | null) ?? [],
    hasContent: conContenido.has(c.id),
    stale: piezaDesactualizadaPorHandoff(
      { slug: c.slug, contentUpdatedAt: c.contentUpdatedAt, hasContent: conContenido.has(c.id) },
      proyecto?.handoffGeneratedAt ?? null,
    ),
  }));
}

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
        // Los tres hechos que declaran de qué CLASE es el proyecto. Se traen aunque el
        // rail no los muestre: `esProyectoNavegable` los pide, y pedirlos siempre es lo
        // que impide que este filtro vuelva a divergir del de la pestaña inicial.
        hubspotPipelineId: true,
        proyectoInterno: true,
        hermanoCsProjectId: true,
      },
    }),
    prisma.hubspotAccount.findFirst({
      where: { clientId: id },
      select: { id: true },
    }),
  ]);

  if (!client) notFound();

  /* El rail de proyectos. MISMO criterio que la pestaña inicial del layout —importado, no
     copiado—: cuando estaban copiados, uno filtraba en SQL y el otro en JavaScript y
     trataban distinto a los proyectos con `serviceType` NULL, así que el layout podía
     elegir como pestaña inicial un proyecto que este rail no mostraba. */
  const hasHubspot = !!hubspotAccount || !!client.hubspotCompanyId;
  const paraFiltro = {
    hubspotCompanyId: client.hubspotCompanyId,
    tieneHubspotAccount: !!hubspotAccount,
  };
  const visibleProjects = projects.filter((p) => esProyectoNavegable(p, paraFiltro));

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
  const initialCanvases = initialProjectId ? await seedCanvases(initialProjectId) : null;

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
