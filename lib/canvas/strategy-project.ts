import { prisma } from "@/lib/db/prisma";

// Secciones predefinidas del canvas "Información del cliente".
// (Ex "canvas de estrategia" — quitamos handoff_ventas y perfil_cliente.)
// El concepto del canvas se redujo a 3 secciones manuales más Docs y Sesiones
// que viven como sub-tabs separados en la UI.
const CLIENT_INFO_SECTIONS = [
  { key: "stakeholders",       label: "Stakeholders" },
  { key: "retos_estrategicos", label: "Retos Estratégicos" },
  { key: "oportunidades",      label: "Oportunidades" },
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
    include: { canvases: { take: 1, select: { id: true } } },
  });

  if (existing) {
    const canvasId = existing.canvases[0]?.id;
    if (canvasId) return { projectId: existing.id, canvasId };

    const canvas = await prisma.projectCanvas.create({
      data: { projectId: existing.id, name: CANVAS_NAME, isDefault: false },
    });
    await prisma.canvasSection.createMany({
      data: CLIENT_INFO_SECTIONS.map((s, i) => ({
        canvasId: canvas.id,
        key: s.key,
        label: s.label,
        order: i,
      })),
    });
    return { projectId: existing.id, canvasId: canvas.id };
  }

  const project = await prisma.project.create({
    data: {
      clientId,
      name: PROJECT_NAME,
      serviceType: SENTINEL_SERVICE_TYPE,
      projectType: "USE_CASE",
      status: "active",
    },
  });

  const canvas = await prisma.projectCanvas.create({
    data: { projectId: project.id, name: CANVAS_NAME, isDefault: false },
  });

  await prisma.canvasSection.createMany({
    data: CLIENT_INFO_SECTIONS.map((s, i) => ({
      canvasId: canvas.id,
      key: s.key,
      label: s.label,
      order: i,
    })),
  });

  return { projectId: project.id, canvasId: canvas.id };
}

// Alias legacy para no romper imports existentes que aún llamen
// `ensureStrategyProject`. Eliminar en cleanup posterior.
export const ensureStrategyProject = ensureClientInfoProject;
export type StrategyProjectRef = ClientInfoProjectRef;
