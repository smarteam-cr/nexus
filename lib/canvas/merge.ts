import type { ClientCanvas, ProjectCanvas } from "./template";

type AnyCanvas = ClientCanvas | ProjectCanvas;

/**
 * Deep merge de canvas updates sobre un canvas existente.
 * - Strings: overwrite si el update no está vacío
 * - Arrays simples (string[]): reemplazar completo
 * - Arrays de objetos con `nombre`: merge por nombre (match existentes, agregar nuevos)
 * - Objetos: merge recursivo
 */
export function deepMergeCanvas<T extends AnyCanvas>(
  current: T,
  updates: Partial<T>
): T {
  const result = { ...current };

  for (const key of Object.keys(updates) as (keyof T)[]) {
    if (!(key in current)) continue; // ignorar keys inválidas

    const currentVal = current[key];
    const updateVal = updates[key];

    if (updateVal === undefined || updateVal === null) continue;

    // Arrays
    if (Array.isArray(currentVal) && Array.isArray(updateVal)) {
      result[key] = mergeArrays(currentVal, updateVal) as T[keyof T];
      continue;
    }

    // Objetos (no arrays)
    if (
      typeof currentVal === "object" &&
      currentVal !== null &&
      !Array.isArray(currentVal) &&
      typeof updateVal === "object" &&
      !Array.isArray(updateVal)
    ) {
      result[key] = mergeObjects(
        currentVal as Record<string, unknown>,
        updateVal as Record<string, unknown>
      ) as T[keyof T];
      continue;
    }

    // Strings y otros primitivos: overwrite si no vacío
    if (typeof updateVal === "string" && updateVal.trim() === "") continue;
    result[key] = updateVal as T[keyof T];
  }

  return result;
}

function mergeArrays(current: unknown[], update: unknown[]): unknown[] {
  if (update.length === 0) return current;

  // Si son arrays de objetos con campo `nombre`, merge por nombre
  const firstItem = update[0];
  if (
    typeof firstItem === "object" &&
    firstItem !== null &&
    "nombre" in firstItem
  ) {
    const merged = [...current] as Record<string, unknown>[];
    for (const item of update as Record<string, unknown>[]) {
      const name = item.nombre as string;
      const idx = merged.findIndex(
        (m) => (m.nombre as string)?.toLowerCase() === name?.toLowerCase()
      );
      if (idx >= 0) {
        // Actualizar existente
        merged[idx] = { ...merged[idx], ...item };
      } else {
        // Agregar nuevo
        merged.push(item);
      }
    }
    return merged;
  }

  // Arrays simples (string[], etc): reemplazar completo
  return update;
}

function mergeObjects(
  current: Record<string, unknown>,
  update: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...current };
  for (const [k, v] of Object.entries(update)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v)) {
      result[k] = mergeArrays(
        (current[k] as unknown[]) ?? [],
        v as unknown[]
      );
    } else {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Valida que un objeto de updates solo contenga keys válidas del canvas.
 */
export function validateCanvasKeys<T extends AnyCanvas>(
  template: T,
  updates: Record<string, unknown>
): Partial<T> {
  const valid: Partial<T> = {};
  for (const key of Object.keys(updates)) {
    if (key in template) {
      (valid as Record<string, unknown>)[key] = updates[key];
    }
  }
  return valid;
}
