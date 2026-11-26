/**
 * lib/plan-general/schema.ts — lo que entra por las rutas del plan general (2026-11-26). Client-safe.
 * La regla de cada campo es la del cronograma: una fase dura al menos una semana y arranca en una semana ≥ 0 (S0 es la
 * primera); el número de loop va de 0 («00 · Transversal») a 99.
 */
import { z } from "zod";
import { ACTIVITY_TYPES } from "@/lib/timeline/validate";
import { esFechaDeProyecto } from "@/lib/timeline/fecha-de-arranque";

const nombre = z.string().trim().min(1, "La fase necesita un nombre.").max(120, "El nombre de la fase es muy largo (hasta 120 letras).");
const loop = z.number({ error: "El loop es un número de 00 a 99." }).int("El loop es un número entero.").min(0, "El loop va de 00 a 99.").max(99, "El loop va de 00 a 99.");
const semanaDeInicio = z
  .number({ error: "La semana de arranque es un número." })
  .int("La semana de arranque es un número entero.")
  .min(0, "La fase arranca en S0 o después.")
  .max(520, "La fase arranca como mucho en la semana 520.");
const duracion = z
  .number({ error: "Las semanas de la fase son un número." })
  .int("Las semanas de la fase son un número entero.")
  .min(1, "Una fase dura al menos una semana.")
  .max(104, "Una fase dura como mucho 104 semanas.");

export const NuevaFaseDelPlan = z.object({
  name: nombre,
  loopNumero: loop.nullable().optional(),
  startWeek: semanaDeInicio,
  durationWeeks: duracion,
  activityType: z.enum(ACTIVITY_TYPES).nullable().optional(),
});
export type NuevaFaseDelPlan = z.infer<typeof NuevaFaseDelPlan>;

export const CambioDeFaseDelPlan = z
  .object({
    name: nombre.optional(),
    loopNumero: loop.nullable().optional(),
    startWeek: semanaDeInicio.optional(),
    durationWeeks: duracion.optional(),
    sessionCount: z.number().int("Las sesiones son un número entero.").min(0, "Las sesiones van de 0 a 999.").max(999, "Las sesiones van de 0 a 999.").nullable().optional(),
    activityType: z.enum(ACTIVITY_TYPES).nullable().optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined), "Nada que cambiar");
export type CambioDeFaseDelPlan = z.infer<typeof CambioDeFaseDelPlan>;

export const ProyectosDelPlan = z.object({
  projectIds: z.array(z.string().min(1)).max(50),
});

export const ArranqueDelPlan = z.object({
  /** AAAA-MM-DD, como lo manda el Gantt; null = volver al de los proyectos. */
  arranque: z
    .string()
    .refine(esFechaDeProyecto, "La fecha de arranque tiene que ser una fecha AAAA-MM-DD de un año entre 2000 y 2100.")
    .nullable(),
});
