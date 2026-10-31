/**
 * lib/cuestionario/sin-archivar.ts — los cuestionarios que siguen en juego (2026-10-30): los de siempre y los de una tanda
 * viva. Archivar una tanda hace lo que dice: el cliente deja de verlos y los agentes de leerlos; recuperarla los devuelve.
 */
import type { Prisma } from "@prisma/client";

export const SIN_ARCHIVAR = { OR: [{ canvasId: null }, { canvas: { disabledAt: null } }] } as const satisfies Prisma.CuestionarioWhereInput;
