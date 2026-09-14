/**
 * lib/documentacion/esquema.ts — la validación de lo que entra por la API de Documentación (zod).
 *
 * SOLO lo importan las rutas: `lib/auth/client-safe.test.ts` prohíbe que un archivo `"use client"`
 * importe valores de un módulo que trae zod.
 *
 * ⛔ Los ids se validan con `min(1)` y NUNCA con `.cuid()`: hay filas del equipo creadas como
 * UUID, y un `.cuid()` las rechaza con un 400 que parece un bug de permisos.
 */
import { z } from "zod";

const id = z.string().min(1).max(64);

/** Un emoji (o vacío para sacarlo). Se acota el largo, no la forma: hay emojis compuestos. */
const icono = z.string().max(16);

export const CrearPagina = z.object({
  titulo: z.string().trim().min(1, "Poné un título.").max(200),
  parentId: id.nullish(),
  icono: icono.nullish(),
});
export type CrearPaginaInput = z.infer<typeof CrearPagina>;

/**
 * Guardar el CONTENIDO: viaja la versión que el editor leyó. El servidor escribe solo si sigue
 * siendo esa (si no, 409). Los bloques se validan por su forma mínima; el saneo real —y el texto
 * para buscar— los hace el servidor con `sanearBloques`, nunca el navegador.
 */
export const GuardarContenido = z.object({
  version: z.number().int().min(0),
  contenido: z.array(z.unknown()).max(5000),
});
export type GuardarContenidoInput = z.infer<typeof GuardarContenido>;

/** Título e ícono: gana el último que guarda, sin control de versión (no es el contenido). */
export const EditarMetadatos = z
  .object({
    titulo: z.string().trim().min(1).max(200).optional(),
    icono: icono.nullable().optional(),
  })
  .refine((v) => v.titulo !== undefined || v.icono !== undefined, {
    message: "No hay nada que cambiar.",
  });
export type EditarMetadatosInput = z.infer<typeof EditarMetadatos>;

/** Mover: `parentId` null = a la raíz. `indice` es la posición entre las hermanas del destino. */
export const MoverPagina = z.object({
  parentId: id.nullable(),
  indice: z.number().int().min(0).max(9999).optional(),
});
export type MoverPaginaInput = z.infer<typeof MoverPagina>;

export const CambiarBloqueo = z.object({ bloqueada: z.boolean() });

/* ── Comentarios (2026-09-13) ─────────────────────────────────────────────────
   El largo del contexto acompaña a `LARGO_DE_CONTEXTO` de `comentarios.ts`, con holgura. */
const cuerpoDeComentario = z
  .string()
  .trim()
  .min(1, "Escribe el comentario.")
  .max(5000, "El comentario es demasiado largo.");

/** Un hilo nuevo: dónde (bloque + texto citado, con su contexto) y el primer comentario. */
export const CrearHilo = z.object({
  bloqueId: id,
  cita: z.string().max(500, "El texto marcado es demasiado largo: marca un pedazo más corto."),
  antes: z.string().max(60),
  despues: z.string().max(60),
  cuerpo: cuerpoDeComentario,
});
export type CrearHiloInput = z.infer<typeof CrearHilo>;

export const Responder = z.object({ cuerpo: cuerpoDeComentario });

export const CambiarResuelto = z.object({ resuelto: z.boolean() });

export const EditarComentario = z.object({ cuerpo: cuerpoDeComentario });

export const Buscar = z.object({
  q: z.string().trim().min(2, "Escribí al menos dos letras.").max(120),
  limite: z.coerce.number().int().min(1).max(50).optional(),
});
