/**
 * lib/analizador-venta/schema.ts — los cuerpos que aceptan las rutas del análisis de la venta (S4 y S5, 2026-10-27), con
 * Zod. Aparte de revision.ts para que el navegador no cargue zod al pintar (lib/auth/client-safe.test.ts › C-24).
 */
import { z } from "zod";
import { MAX_LETRAS_DE_LA_NOTA } from "./revision";

const sesion = z.string().trim().min(1).max(64);

export const RevisionSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("confirmar"),
    sessionId: sesion,
    /** El análisis que la persona leyó (su `analizadoAt`): si cambió, no se confirma. */
    analizadoAt: z.string().datetime(),
    nota: z.string().trim().max(MAX_LETRAS_DE_LA_NOTA).optional(),
  }),
  z.object({ accion: z.literal("desconfirmar"), sessionId: sesion }),
]);
export type Revision = z.infer<typeof RevisionSchema>;

export const AnalizarSchema = z.object({ sessionId: sesion });
