/**
 * lib/tiempos/schema.ts — lo que entra por la API de Tiempos, validado con Zod (ARCHITECTURE §3).
 */
import { z } from "zod";
import { DOCUMENTOS, PARTIES, TIPOS_DE_FASE } from "./reglas";

const minutos = z
  .number({ message: "Falta el tiempo." })
  .int("El tiempo va en minutos enteros.")
  .min(1, "El tiempo tiene que ser de al menos un minuto.")
  .max(14400, "Eso es más de un mes de jornadas: revisa el número.");

/** Responder u omitir una pregunta. */
export const respuestaSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("responder"), minutos }),
  z.object({ accion: z.literal("omitir"), motivo: z.enum(["omitir", "no_lo_hice"]) }),
]);
export type RespuestaInput = z.infer<typeof respuestaSchema>;

const claves = <T extends string>(lista: readonly { clave: T }[]) => lista.map((x) => x.clave) as [T, ...T[]];

export const configSchema = z.object({
  v: z.literal(1),
  aQuien: z.object({
    roles: z.array(z.string().min(1)).max(20),
    frentes: z.array(z.string().min(1)).max(20),
    personas: z.array(z.string().email("Un correo no es válido.")).max(100),
  }),
  tareas: z.object({
    tipos: z.array(z.enum(claves(TIPOS_DE_FASE))),
    parties: z.array(z.enum(claves(PARTIES))),
    proyectos: z.array(z.string().min(1)).max(500),
  }),
  documentos: z.array(z.enum(claves(DOCUMENTOS))),
  pregunta: z.string().trim().min(3, "Escribe la pregunta.").max(160, "La pregunta es muy larga."),
  opciones: z
    .array(z.object({ texto: z.string().trim().min(1, "Cada opción necesita un texto.").max(24, "El texto de una opción es muy largo."), minutos }))
    .min(2, "Deja al menos dos opciones.")
    .max(8, "Como mucho ocho opciones: más que eso ya no se responde con un clic."),
  estimacion: z.enum(["despues", "lado", "no"]),
  muestreo: z.object({ modo: z.enum(["todas", "uno_de", "calibrar"]), cadaN: z.number().int().min(2).max(20) }),
  topePorDia: z.number().int().min(1).max(50).nullable(),
});

/** Cambiar una encuesta: prenderla o apagarla, o su configuración. */
export const encuestaPatchSchema = z
  .object({ activa: z.boolean().optional(), config: configSchema.optional() })
  .refine((b) => b.activa !== undefined || b.config !== undefined, { message: "No hay nada que cambiar." });
export type EncuestaPatch = z.infer<typeof encuestaPatchSchema>;
