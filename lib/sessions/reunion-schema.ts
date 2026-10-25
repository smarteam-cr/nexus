/**
 * lib/sessions/reunion-schema.ts — las fronteras (Zod) de lo que una persona hace con una reunión sin texto o sin empresa
 * (T3, T5, T8 y T9, 2026-10-25). Las reglas viven en sus módulos; acá solo la forma de cada pedido.
 */
import { z } from "zod";
import { MAX_TEXTO_A_MANO } from "./reunion-a-mano";
import { MAX_BYTES_AUDIO } from "./audio-de-reunion";

/** POST /api/sessions/[id]/empresa — confirmar la propuesta, elegir otra empresa o mover la reunión (T8). */
export const EmpresaDeLaReunion = z.discriminatedUnion("accion", [
  // La propuesta que vio la persona: si cambió mientras tanto, 409 (no se confirma una que no vio).
  z.object({ accion: z.literal("confirmar"), esperada: z.object({ tipo: z.enum(["CLIENTE", "HUBSPOT"]), clave: z.string().min(1).max(64) }) }),
  z.object({ accion: z.literal("elegir"), clientId: z.string().min(1).max(64) }),
  z.object({ accion: z.literal("mover"), clientId: z.string().min(1).max(64) }),
]);

/** POST /api/sessions/[id]/contexto — lo que contó una persona respondiendo las preguntas de Nexus (T9). */
export const ContextoDeLaReunion = z.object({
  respuestas: z
    .array(z.object({ pregunta: z.string().trim().min(1).max(400), respuesta: z.string().max(MAX_TEXTO_A_MANO) }))
    .max(6),
  /** «Algo más que quieras contar». */
  extra: z.string().max(MAX_TEXTO_A_MANO).default(""),
});

/** POST /api/sessions/[id]/audio — empezar la subida del audio (T5). */
export const SubidaDelAudio = z.object({
  archivo: z.string().trim().min(1).max(200),
  tipo: z.string().trim().max(100).default(""),
  bytes: z.number().int().positive().max(MAX_BYTES_AUDIO),
});
