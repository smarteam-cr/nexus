/**
 * lib/clients/schema.ts — lo que entra por las rutas de los datos de la empresa (R1, 2026-10-24). PURO.
 *
 * El valor llega crudo (texto o número) y el TIPO lo valida después el catálogo (`leerValor`): acá solo la forma.
 */
import { z } from "zod";
import { CLAVES_DE_DATO } from "./datos-de-la-empresa";

const valorCrudo = z.union([z.string().max(300), z.number(), z.null()]);

/** POST /api/clients/[id]/datos — una persona edita un dato (o lo propone, si no puede decidir). */
export const EdicionDeDatoSchema = z.object({
  clave: z.enum(CLAVES_DE_DATO),
  valor: valorCrudo,
  /** El porqué, opcional: lo ve quien decide. */
  cita: z.string().trim().max(1000).optional(),
});
export type EdicionDeDato = z.infer<typeof EdicionDeDatoSchema>;

/** PATCH /api/clients/[id]/datos/propuestas/[propuestaId] — usar, editar o descartar una propuesta. */
export const DecisionDePropuestaSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("usar") }),
  z.object({ accion: z.literal("editar"), valor: valorCrudo }),
  z.object({ accion: z.literal("descartar") }),
]);
export type DecisionDePropuestaBody = z.infer<typeof DecisionDePropuestaSchema>;
