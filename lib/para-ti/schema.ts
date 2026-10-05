/**
 * lib/para-ti/schema.ts — lo que entra por HTTP a «Para ti» (2026-10-04). Zod en la frontera (ARCHITECTURE §3).
 */
import { z } from "zod";
import { CLAVES_DE_FRENTE } from "./frentes";

export const marcarLeidosSchema = z.union([
  z.object({ todos: z.literal(true) }).strict(),
  z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(200) }).strict(),
]);

/** Los frentes que se guardan desde Equipo: claves conocidas, sin repetir. */
export const frentesSchema = z
  .array(z.enum(CLAVES_DE_FRENTE))
  .max(CLAVES_DE_FRENTE.length)
  .transform((xs) => [...new Set(xs)]);
