/**
 * lib/notas/schema.ts — lo que entra por las rutas de las notas de la cuenta (etapa 5 de docs/mi-dia-plan.md).
 */
import { z } from "zod";
import { CANALES_A_MANO, MAX_TEXTO_DE_LA_NOTA } from "./reglas";

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.");

/** Una nota escrita a mano en La cuenta › Notas. */
export const nuevaNotaSchema = z.object({
  canal: z.enum(CANALES_A_MANO, { message: "Elige por dónde fue." }),
  fecha: dia,
  texto: z
    .string()
    .trim()
    .min(1, "Escribe qué pasó.")
    .max(MAX_TEXTO_DE_LA_NOTA, `La nota admite hasta ${MAX_TEXTO_DE_LA_NOTA} caracteres.`),
  projectId: z.string().min(1).max(60).nullable().optional(),
  /** El negocio de Nexus (NegocioAbierto.id): el servidor lo traduce a su id de HubSpot. */
  negocioId: z.string().min(1).max(60).nullable().optional(),
});
export type NuevaNota = z.infer<typeof nuevaNotaSchema>;

/** Usar la nota sugerida después de una reunión (con el texto que dejó la persona). */
export const usarSugerenciaSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(1, "La nota no puede ir vacía.")
    .max(MAX_TEXTO_DE_LA_NOTA, `La nota admite hasta ${MAX_TEXTO_DE_LA_NOTA} caracteres.`),
});
