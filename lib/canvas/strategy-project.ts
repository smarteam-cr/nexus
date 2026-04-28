import { prisma } from "@/lib/db/prisma";

// Secciones predefinidas del canvas de estrategia
const STRATEGY_SECTIONS = [
  { key: "handoff_ventas",     label: "Handoff de Ventas" },
  { key: "perfil_cliente",     label: "Perfil del Cliente" },
  { key: "stakeholders",       label: "Stakeholders" },
  { key: "retos_estrategicos", label: "Retos Estratégicos" },
  { key: "oportunidades",      label: "Oportunidades" },
];

export interface StrategyProjectRef {
  projectId: string;
  canvasId: string;
}

/**
 * Devuelve (y crea si no existe) el Project de estrategia del cliente.
 * El proyecto usa serviceType "__strategy__" para distinguirse de proyectos
 * normales y nunca aparece en las tabs de proyectos.
 */
export async function ensureStrategyProject(clientId: string): Promise<StrategyProjectRef> {
  // Buscar proyecto existente
  const existing = await prisma.project.findFirst({
    where: { clientId, serviceType: "__strategy__" },
    include: { canvases: { take: 1, select: { id: true } } },
  });

  if (existing) {
    const canvasId = existing.canvases[0]?.id;
    if (canvasId) return { projectId: existing.id, canvasId };

    // Proyecto existe pero sin canvas — crear canvas y secciones
    const canvas = await prisma.projectCanvas.create({
      data: { projectId: existing.id, name: "Estrategia del Cliente", isDefault: false },
    });
    await prisma.canvasSection.createMany({
      data: STRATEGY_SECTIONS.map((s, i) => ({
        canvasId: canvas.id,
        key: s.key,
        label: s.label,
        order: i,
      })),
    });
    return { projectId: existing.id, canvasId: canvas.id };
  }

  // Crear proyecto + canvas + secciones desde cero
  const project = await prisma.project.create({
    data: {
      clientId,
      name: "Estrategia",
      serviceType: "__strategy__",
      projectType: "USE_CASE",
      status: "active",
    },
  });

  const canvas = await prisma.projectCanvas.create({
    data: { projectId: project.id, name: "Estrategia del Cliente", isDefault: false },
  });

  await prisma.canvasSection.createMany({
    data: STRATEGY_SECTIONS.map((s, i) => ({
      canvasId: canvas.id,
      key: s.key,
      label: s.label,
      order: i,
    })),
  });

  return { projectId: project.id, canvasId: canvas.id };
}
