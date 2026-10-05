/**
 * lib/escala/comentarios/esquema.ts — lo que entra por la API de comentarios de la escala (zod).
 *
 * SOLO lo importan las rutas: `lib/auth/client-safe.test.ts` prohíbe que un archivo `"use client"`
 * importe valores de un módulo que trae zod.
 *
 * ⛔ Los ids se validan con `min(1)` y NUNCA con `.cuid()`: hay filas creadas como UUID.
 * El TEXTO del ancla no entra por acá: lo congela el servidor desde la versión publicada.
 */
import { z } from "zod";
import { FORMA_DE_ANCLA } from "@/lib/escala/documento/anclas";
import { FORMA_DE_EDICION } from "@/lib/escala/documento/parsear";
import { CIERRES, DESPUES } from "@/lib/escala/documento/perfil";

const id = z.string().min(1).max(64);

const texto = (vacio: string, max = 5000) =>
  z.string().trim().min(1, vacio).max(max, "Es demasiado largo.");

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Es demasiado largo.")
    .nullish()
    .transform((v) => (v ? v : null));

export const CrearComentario = z
  .object({
    ancla: z.string().trim().regex(FORMA_DE_ANCLA, "Ese identificador no tiene la forma de la escala."),
    tipo: z.enum(["no_se_entiende", "no_calza", "propuesta"]),
    cuerpo: texto("Escribe el comentario."),
    decisionQueCambiaria: opcional(1000),
    clienteId: id.nullish(),
    clienteNombre: opcional(200),
    perfilCierre: z.enum(CIERRES as unknown as [string, ...string[]]).nullish(),
    perfilDespues: z.enum(DESPUES as unknown as [string, ...string[]]).nullish(),
    // La clave de la edición por industria desde la que se comenta (o nada: la escala general). Que
    // esa edición exista en la versión publicada lo mira `crearComentario`.
    edicion: z
      .string()
      .trim()
      .max(80)
      .regex(FORMA_DE_EDICION, "Esa no es la clave de una edición.")
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .refine((v) => v.tipo !== "no_calza" || !!v.clienteId || !!v.clienteNombre, {
    message: "Di con qué cliente no calza.",
    path: ["clienteId"],
  });
export type CrearComentarioInput = z.infer<typeof CrearComentario>;

export const EditarComentario = z.object({
  cuerpo: texto("Escribe el comentario."),
  decisionQueCambiaria: opcional(1000),
});

export const Responder = z.object({ cuerpo: texto("Escribe la respuesta.") });

// El estado no entra por acá: desde el 2026-10-05 se decide en la bandeja de /feedback
// (lib/feedback/schema.ts, `Decidir`), con la fila del manual al llevarlo a la hoja de ruta.

/** Filtros del listado (query string). */
export const FiltroDeComentarios = z.object({
  area: z.string().regex(/^\d+$/).optional(),
  ancla: z.string().regex(FORMA_DE_ANCLA).optional(),
  estado: z.enum(["abierto", "respondido", "cambio_pendiente", "descartado"]).optional(),
});
