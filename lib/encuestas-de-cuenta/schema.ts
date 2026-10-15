/**
 * lib/encuestas-de-cuenta/schema.ts — lo que aceptan las rutas de las preguntas sobre la cuenta (Zod, en la frontera).
 */
import { z } from "zod";
import { EVENTOS, VALORES_DE_RESPUESTA } from "./preguntas";

export const eventoDePreguntaSchema = z
  .object({
    clave: z.string().min(1).max(80),
    evento: z.enum(EVENTOS),
    valor: z.enum(VALORES_DE_RESPUESTA).nullish(),
    porQue: z.string().max(1000, "El porqué no puede pasar de 1.000 caracteres.").nullish(),
    ruta: z.string().max(300).nullish(),
  })
  .refine((v) => v.evento !== "respondida" || !!v.valor, { message: "Falta la respuesta." });

export const activaSchema = z.object({ clave: z.string().min(1).max(80), activa: z.boolean() });
