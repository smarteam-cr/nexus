/**
 * lib/siguiente-paso/schema.ts — lo que acepta la API del siguiente paso (2026-10-15). CLIENT-SAFE.
 */
import { z } from "zod";

export const NuevoPasoSchema = z
  .object({
    objeto: z.enum(["empresa", "negocio", "proyecto"]),
    objetoId: z.string().min(1).max(60),
    equipo: z.enum(["ventas", "cs", "dev"]),
    que: z.string().trim().min(1, "Escribe qué sigue.").max(500, "Que sea corto: hasta 500 caracteres."),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.")
      .nullable()
      .optional(),
    responsableEmail: z.string().email().max(200).nullable().optional(),
  })
  .strict();

export type NuevoPasoDeLaApi = z.infer<typeof NuevoPasoSchema>;
