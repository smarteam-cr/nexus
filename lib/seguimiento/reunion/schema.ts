/**
 * lib/seguimiento/reunion/schema.ts — lo que aceptan las rutas de la página de una reunión (ficha G). Zod en la frontera.
 * SERVIDOR (los topes del correo salen del correo de las exploraciones, por correo-server.ts).
 */
import "server-only";
import { z } from "zod";
import { MAX_AGENDA_ESCRITA } from "./agenda";
import { MAX_ASUNTO_DEL_CORREO, MAX_CUERPO_DEL_CORREO } from "./correo-server";
import { DURACIONES, MAX_OBJETIVO_DE_LA_PROXIMA, MAX_TITULO_DE_LA_PROXIMA } from "./proxima";

/** PATCH /api/sessions/[id]/seguimiento: una sola cosa por pedido. */
export const CambioDelSeguimiento = z.union([
  z.object({ agenda: z.string().max(MAX_AGENDA_ESCRITA) }).strict(),
  z
    .object({
      correo: z
        .object({ asunto: z.string().max(MAX_ASUNTO_DEL_CORREO).optional(), cuerpo: z.string().max(MAX_CUERPO_DEL_CORREO).optional() })
        .strict()
        .refine((c) => c.asunto !== undefined || c.cuerpo !== undefined, "Falta el asunto o el texto."),
      /** La versión de lo guardado que tiene la pantalla: si ya no es la de la base, 409 y no se pisa. */
      version: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      proxima: z
        .object({
          titulo: z.string().max(MAX_TITULO_DE_LA_PROXIMA).optional(),
          objetivo: z.string().max(MAX_OBJETIVO_DE_LA_PROXIMA).optional(),
          inicio: z.string().datetime().optional(),
          duracionMin: z
            .number()
            .int()
            .refine((n) => (DURACIONES as readonly number[]).includes(n), "Duración no válida.")
            .optional(),
          estado: z.enum(["agendada", "descartada"]).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
]);
export type CambioDelSeguimiento = z.infer<typeof CambioDelSeguimiento>;
