import { prisma } from "@/lib/db/prisma";

export const DEFAULT_PROJECT_CANVASES = [
  { name: "Resumen del servicio", isDefault: true },
  { name: "Diagnóstico", isDefault: false },
  { name: "Planificación", isDefault: false },
  { name: "Ejecución", isDefault: false },
  { name: "Adopción", isDefault: false },
] as const;

/** Create all standard canvases for a project. Call after project creation. */
export async function createDefaultCanvases(projectId: string) {
  await prisma.projectCanvas.createMany({
    data: DEFAULT_PROJECT_CANVASES.map((c) => ({
      projectId,
      name: c.name,
      isDefault: c.isDefault,
      sections: [],
    })),
  });
}
