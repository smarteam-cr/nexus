/**
 * lib/finanzas/revision-esquemas.ts — lo que aceptan las rutas de la revisión (rediseño de Finanzas, 2026-10-03).
 * ⚠ Los ids no se validan como cuid: en la base conviven cuid y UUID.
 */
import { z } from "zod";

export const itemRevisadoSchema = z.object({
  tipo: z.enum(["PAGO", "GASTO"]),
  id: z.string().min(1).max(64),
});

export const revisarSchema = z.object({
  accion: z.enum(["BIEN", "DEVOLVER"]),
  items: z.array(itemRevisadoSchema).min(1, "No hay nada que revisar.").max(300),
  comentario: z.string().trim().max(1000).nullable().optional(),
});
