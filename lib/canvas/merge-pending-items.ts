/**
 * Helper para crear ActionItems desde pendientes generados por agentes.
 *
 * Antes este helper escribía a Project.pendingItems (Json). Ahora crea rows
 * en la tabla ActionItem (modelo del ciclo de reunión, F1 del rediseño).
 * La firma se mantiene para no romper a los callers — internamente:
 *   - Resuelve clientId desde projectId
 *   - Crea 1 ActionItem por cada NewPendingItem nuevo (no duplicado)
 *   - Deduplicación idempotente por text normalizado + clientId + source
 */
import { prisma } from "@/lib/db/prisma";

export interface NewPendingItem {
  text: string;
  source?: string;
}

export interface MergeResult {
  added: number;
  skipped: number;
  total: number;
}

function normalizeText(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Crea ActionItems para los pendientes nuevos. Idempotente por
 * `text normalizado + clientId + source`. Si `projectId` es null/undefined o
 * la lista nueva está vacía, no hace nada.
 *
 * Devuelve cantidad de items NUEVOS creados, saltados (duplicados/vacíos), y
 * total actual de ActionItems pendientes (`done=false`) del proyecto.
 */
export async function mergePendingItemsToProject(
  projectId: string | null | undefined,
  newItems: NewPendingItem[] | undefined | null,
): Promise<MergeResult> {
  if (!projectId || !newItems || newItems.length === 0) {
    return { added: 0, skipped: 0, total: 0 };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true },
  });
  if (!project) return { added: 0, skipped: 0, total: 0 };

  // Cargar ActionItems existentes del proyecto para deduplicar
  const existing = await prisma.actionItem.findMany({
    where: { projectId },
    select: { text: true, source: true },
  });
  const existingKeys = new Set(
    existing.map((it) => `${normalizeText(it.text)}::${it.source ?? ""}`),
  );

  let added = 0;
  let skipped = 0;

  for (const newItem of newItems) {
    const text = (newItem.text ?? "").trim();
    if (!text) {
      skipped++;
      continue;
    }
    const source = newItem.source?.trim() || "agent";
    const key = `${normalizeText(text)}::${source}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    await prisma.actionItem.create({
      data: {
        text,
        clientId: project.clientId,
        projectId: project.id,
        source,
        status: "PENDING",
        done: false,
      },
    });
    existingKeys.add(key);
    added++;
  }

  // Total actual de ActionItems pendientes del proyecto
  const total = await prisma.actionItem.count({
    where: { projectId, done: false },
  });

  console.log(
    `[merge-pending-items] project=${projectId} added=${added} skipped=${skipped} totalPending=${total}`,
  );

  return { added, skipped, total };
}
