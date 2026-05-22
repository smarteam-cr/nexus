/**
 * Helper para mergear nuevos pendientes (generados por agentes) al array
 * `Project.pendingItems` existente, de forma idempotente.
 *
 * Estructura del pendingItems en DB (Json):
 *   [{ text: string, done: boolean, source?: string, addedAt?: string }]
 *
 * La deduplicación es por `text` normalizado (trim + lowercase).
 */
import { prisma } from "@/lib/db/prisma";

export interface PendingItem {
  text: string;
  done: boolean;
  source?: string;
  addedAt?: string;
}

export interface NewPendingItem {
  text: string;
  source?: string;
}

function normalizeText(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface MergeResult {
  added: number;
  skipped: number;
  total: number;
}

/**
 * Mergea nuevos items al `Project.pendingItems`. Idempotente: items con el
 * mismo texto normalizado no se duplican. Si `projectId` es null/undefined,
 * o si la lista nueva está vacía, no hace nada (retorna 0/0/total).
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
    select: { pendingItems: true },
  });

  if (!project) {
    return { added: 0, skipped: 0, total: 0 };
  }

  // Parse existing items (Json field puede ser null o array)
  const existing: PendingItem[] = Array.isArray(project.pendingItems)
    ? (project.pendingItems as unknown as PendingItem[])
    : [];

  const existingNormalized = new Set(
    existing.map((it) => normalizeText(it.text ?? ""))
  );

  let added = 0;
  let skipped = 0;
  const nowIso = new Date().toISOString();

  for (const newItem of newItems) {
    const text = (newItem.text ?? "").trim();
    if (!text) {
      skipped++;
      continue;
    }
    const norm = normalizeText(text);
    if (existingNormalized.has(norm)) {
      skipped++;
      continue;
    }
    existing.push({
      text,
      done: false,
      source: newItem.source?.trim() || undefined,
      addedAt: nowIso,
    });
    existingNormalized.add(norm);
    added++;
  }

  if (added > 0) {
    // Cast a unknown intermedio porque Prisma Json no acepta tipos arbitrarios directamente
    await prisma.project.update({
      where: { id: projectId },
      data: { pendingItems: existing as unknown as object },
    });
  }

  console.log(
    `[merge-pending-items] project=${projectId} added=${added} skipped=${skipped} total=${existing.length}`
  );

  return { added, skipped, total: existing.length };
}
