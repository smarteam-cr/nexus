/**
 * lib/desarrollo/schema.ts — contratos Zod del módulo Desarrollo (frontera HTTP).
 */
import { z } from "zod";

/**
 * Alta de una estimación de esfuerzo.
 *
 * GUARDARRAÍL: al menos UNO de `hours`/`estimatedDate`. Una estimación sin ninguno de los
 * dos no es una estimación — sería una fila de ruido en el historial que además pisaría a
 * la anterior como "vigente" (la vigente es la más reciente), borrando de la vista el dato
 * bueno sin borrar nada de la DB. Por eso se rechaza en la frontera y no más adentro.
 */
export const devEstimateCreateSchema = z
  .object({
    hours: z.number().int().positive().max(10000).nullish(),
    // ISO date (el input date del navegador manda "YYYY-MM-DD").
    estimatedDate: z.string().min(1).nullish(),
    note: z.string().max(2000).nullish(),
  })
  .refine((v) => v.hours != null || (v.estimatedDate != null && v.estimatedDate !== ""), {
    message: "Indicá al menos las horas o la fecha estimada.",
    path: ["hours"],
  });

export type DevEstimateCreateInput = z.infer<typeof devEstimateCreateSchema>;
