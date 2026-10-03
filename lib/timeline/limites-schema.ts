/**
 * lib/timeline/limites-schema.ts — la frontera de PATCH /api/projects/[projectId]/timeline/limites.
 * Aparte de limites.ts para no llevar zod a la pantalla. La regla del acuerdo (motivo y con quién
 * para mover un límite confirmado) vive en `validarCambioDeLimite`: acá solo la forma.
 */
import { z } from "zod";
import { MAX_LARGO_MOTIVO } from "./limites";

const campo = z.enum(["fechaLimite", "duracionVendida"]);

export const cambioDeLimiteSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("guardar"),
    campo,
    /** «AAAA-MM-DD» para la fecha, entero para la duración; null = quitarlo. */
    valor: z.union([z.string().max(10), z.number().int(), z.null()]),
    motivo: z.string().max(MAX_LARGO_MOTIVO).nullish(),
    acordadoCon: z.string().max(200).nullish(),
    /** true = confirma lo que propuso la IA: la fuente que queda es su cita. */
    desdeLaPropuesta: z.boolean().optional(),
  }),
  z.object({ accion: z.literal("descartar-propuesta"), campo }),
]);

export type CambioDeLimiteBody = z.infer<typeof cambioDeLimiteSchema>;
