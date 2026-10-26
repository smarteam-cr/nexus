/**
 * lib/analizador-venta/schema.ts — los cuerpos que aceptan las rutas del análisis de la venta (S4 y S5, 2026-10-27), con
 * Zod. Aparte de revision.ts para que el navegador no cargue zod al pintar (lib/auth/client-safe.test.ts › C-24).
 */
import { z } from "zod";
import { MAX_LETRAS_DEL_COMENTARIO, MAX_LETRAS_PARA_LA_PROXIMA, MAX_PARA_LA_PROXIMA, PUNTOS_DEL_COMENTARIO, TIPOS_DE_COMENTARIO } from "./revision";

const sesion = z.string().trim().min(1).max(64);

export const RevisionSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("comentar"),
    sessionId: sesion,
    tipo: z.enum(TIPOS_DE_COMENTARIO),
    punto: z.enum(PUNTOS_DEL_COMENTARIO).nullable().optional(),
    texto: z.string().trim().min(1).max(MAX_LETRAS_DEL_COMENTARIO),
  }),
  z.object({
    accion: z.literal("confirmar"),
    sessionId: sesion,
    /** El análisis que la persona leyó (su `analizadoAt`): si cambió, no se confirma. */
    analizadoAt: z.string().datetime(),

    nota: z.string().trim().max(MAX_LETRAS_DEL_COMENTARIO).optional(),
    paraLaProxima: z.array(z.string().trim().min(1).max(MAX_LETRAS_PARA_LA_PROXIMA)).max(MAX_PARA_LA_PROXIMA),
  }),
  z.object({ accion: z.literal("desconfirmar"), sessionId: sesion }),
  z.object({ accion: z.literal("referencia"), sessionId: sesion, nota: z.string().trim().max(500).optional() }),
  z.object({ accion: z.literal("quitar-referencia"), sessionId: sesion }),
]);
export type Revision = z.infer<typeof RevisionSchema>;

export const AnalizarSchema = z.object({ sessionId: sesion });
