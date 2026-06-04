import { prisma } from "@/lib/db/prisma";

// Secciones predefinidas del canvas "Información del cliente".
// (Ex "canvas de estrategia" — quitamos handoff_ventas y perfil_cliente.)
// El concepto del canvas se redujo a 3 secciones manuales más Docs y Sesiones
// que viven como sub-tabs separados en la UI.
const CLIENT_INFO_SECTIONS = [
  { key: "stakeholders",       label: "Stakeholders" },
  { key: "retos_estrategicos", label: "Retos Estratégicos" },
  { key: "oportunidades",      label: "Oportunidades" },
  { key: "procesos",           label: "Procesos" }, // migrado del ex-canvas Resumen
];

// Nombre interno del project — se mantiene el sentinel "__strategy__" como
// serviceType para no romper queries en otros archivos que ya filtran por él.
const SENTINEL_SERVICE_TYPE = "__strategy__";
const PROJECT_NAME = "Información del cliente";
const CANVAS_NAME = "Información del cliente";

export interface ClientInfoProjectRef {
  projectId: string;
  canvasId: string;
}

/**
 * Devuelve (y crea si no existe) el Project que aloja la "Información del
 * cliente". Internamente usa `serviceType="__strategy__"` (legacy) como
 * sentinel para diferenciarlo de proyectos normales — nunca aparece en las
 * tabs de proyectos.
 */
export async function ensureClientInfoProject(clientId: string): Promise<ClientInfoProjectRef> {
  const existing = await prisma.project.findFirst({
    where: { clientId, serviceType: SENTINEL_SERVICE_TYPE },
    select: { id: true },
  });

  let projectId: string;
  let canvasId: string;

  if (existing) {
    projectId = existing.id;
    // Buscar el canvas por NOMBRE (no canvases[0]): algunos sentinel arrastran
    // canvases Handoff/Kickoff de migraciones viejas, y canvases[0] sin orderBy
    // podría devolver el equivocado y romper las pestañas de Información del cliente.
    const named = await prisma.projectCanvas.findFirst({
      where: { projectId: existing.id, name: CANVAS_NAME },
      select: { id: true },
    });
    canvasId =
      named?.id ??
      (
        await prisma.projectCanvas.create({
          data: { projectId: existing.id, name: CANVAS_NAME, isDefault: false },
        })
      ).id;
  } else {
    const project = await prisma.project.create({
      data: {
        clientId,
        name: PROJECT_NAME,
        serviceType: SENTINEL_SERVICE_TYPE,
        projectType: "USE_CASE",
        status: "active",
      },
    });
    projectId = project.id;
    canvasId = (
      await prisma.projectCanvas.create({
        data: { projectId: project.id, name: CANVAS_NAME, isDefault: false },
      })
    ).id;
  }

  // Asegura TODAS las secciones (idempotente vía @@unique([canvasId, key])): así
  // los canvases viejos reciben la sección "procesos" en el próximo load.
  await prisma.canvasSection.createMany({
    data: CLIENT_INFO_SECTIONS.map((s, i) => ({ canvasId, key: s.key, label: s.label, order: i })),
    skipDuplicates: true,
  });

  return { projectId, canvasId };
}

// Alias legacy para no romper imports existentes que aún llamen
// `ensureStrategyProject`. Eliminar en cleanup posterior.
export const ensureStrategyProject = ensureClientInfoProject;
export type StrategyProjectRef = ClientInfoProjectRef;
