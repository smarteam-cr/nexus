import { requireAccessToClient } from "@/lib/auth/access";
import { UnauthorizedError, ForbiddenError, requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { espacioDe } from "@/lib/clients/kind";
import EspacioPropuestas from "@/components/clients/EspacioPropuestas";
import EspacioSesiones from "@/components/clients/EspacioSesiones";
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

  /* ── QUÉ ES esta empresa. Se pregunta ANTES que nada, y no es un detalle de orden ──────
     La CATEGORÍA decide qué espacio se abre (`ESPACIO_POR_CATEGORIA`, lib/clients/kind.ts).
     Las que no son cartera —prospectos, aliados, nosotros— no tienen proyectos, así que todo
     lo que sigue no solo sobraría: `ensureStrategyProject` **escribe**, y le estaba creando un
     "proyecto de estrategia" a un prospecto que no compró nada. Salir temprano es lo que lo
     evita; filtrar al final habría dejado el efecto igual. */
  const empresa = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true, kind: true, hubspotCompanyId: true },
  });
  if (!empresa) notFound();

  const espacio = espacioDe(empresa.kind);

  if (espacio === "propuestas") {
    /* El gate es de VENTAS y no de esta pantalla: quien llegó hasta acá ya tiene acceso a la
       empresa. Lo único que decide es si la propuesta se puede ABRIR — /business-cases/[id]
       redirige sin `ventas.read`, y un link que rebota se lee como que la app está rota. */
    const ctx = await requireInternalUser().catch(() => null);
    const puedeVerVentas = ctx ? await can(ctx.teamMember, "ventas", "read") : false;
    return (
      <EspacioPropuestas
        clientId={id}
        clientName={empresa.name}
        puedeVerVentas={puedeVerVentas}
      />
    );
  }

  if (espacio === "sesiones") {
    return <EspacioSesiones clientId={id} clientName={empresa.name} kind={empresa.kind} />;
  }

  const [projects, hubspotAccount] = await Promise.all([
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
        // El alta a medio hacer y su diagnóstico. Van en el mismo row porque el cartel que
        // los muestra vive en el rail: pedirlos aparte sería una query por proyecto para un
        // caso que en el 99% de las filas no dispara nada.
        altaEstado: true,
        altaError: true,
        altaUltimoIntentoAt: true,
        altaActorEmail: true,
        altaIntentos: true,
        // Tanda M — si el handoff dejó una propuesta de cronograma sin revisar. Mismo
        // criterio que el alta: va en el mismo row para no pagar una query por proyecto.
        timeline: { select: { pendingProposal: true } },
      },
    }),
    prisma.hubspotAccount.findFirst({
      where: { clientId: id },
      select: { id: true },
    }),
  ]);

  /* El rail de proyectos. MISMO criterio que la pestaña inicial del layout —importado, no
     copiado—: cuando estaban copiados, uno filtraba en SQL y el otro en JavaScript y
     trataban distinto a los proyectos con `serviceType` NULL, así que el layout podía
     elegir como pestaña inicial un proyecto que este rail no mostraba. */
  const hasHubspot = !!hubspotAccount || !!empresa.hubspotCompanyId;
  const paraFiltro = {
    hubspotCompanyId: empresa.hubspotCompanyId,
    tieneHubspotAccount: !!hubspotAccount,
  };
  const visibleProjects = projects
    .filter((p) => esProyectoNavegable(p, paraFiltro))
    .map(({ timeline, ...p }) => ({ ...p, timelineProposalPending: timeline?.pendingProposal != null }));

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
