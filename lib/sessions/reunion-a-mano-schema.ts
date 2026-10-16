/**
 * lib/sessions/reunion-a-mano-schema.ts — la frontera de «Agregar una reunión» (Zod). Las reglas de qué se acepta
 * viven en lib/sessions/reunion-a-mano.ts (client-safe, sin zod); acá solo la forma del pedido.
 */
import { z } from "zod";
import { MAX_PERSONAS, MAX_PROYECTOS, MAX_TEXTO_A_MANO } from "./reunion-a-mano";

export const agregarReunionSchema = z.object({
  clientId: z.string().min(1).max(64),
  /** «AAAA-MM-DD», en hora de Costa Rica. */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD."),
  /** «HH:MM». Sin hora, el mediodía. */
  hora: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullish(),
  duracionMin: z.number().int().min(0).max(600).nullish(),
  titulo: z.string().trim().max(200).default(""),
  proyectoIds: z.array(z.string().min(1).max(64)).max(MAX_PROYECTOS).default([]),
  /** Correos de la gente del equipo que estuvo. */
  equipo: z.array(z.string().trim().max(200)).max(MAX_PERSONAS).default([]),
  /** La gente del cliente: un correo o un nombre. */
  delCliente: z.array(z.string().trim().max(120)).max(MAX_PERSONAS).default([]),
  contenido: z.object({
    tipo: z.enum(["transcripcion", "recuerdo"]),
    texto: z.string().max(MAX_TEXTO_A_MANO + 1_000),
  }),
  /** Agregarle lo que pasó a una reunión que ya está (de Meet, sin transcripción ni notas). */
  reunionExistenteId: z.string().min(1).max(200).nullish(),
  /** Ya vio las reuniones de ese día y es otra. */
  confirmarOtra: z.boolean().default(false),
});

export type AgregarReunionInput = z.infer<typeof agregarReunionSchema>;
