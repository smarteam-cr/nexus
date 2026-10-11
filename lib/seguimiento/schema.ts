/**
 * lib/seguimiento/schema.ts — lo que acepta la API de «Lo que dejó esta reunión». Zod en la frontera.
 */
import { z } from "zod";

/** POST /api/sessions/[id]/lo-que-dejo: «Usar todo», con la huella de la tarjeta que se vio. */
export const UsarTodo = z.object({
  huella: z.string().min(8).max(80),
});

export type PedidoDeUsarTodo = z.infer<typeof UsarTodo>;

/** PATCH /api/sessions/[id]/minute: revisar o corregir la minuta. */
const Texto = z.object({ text: z.string().max(4000) });
export const CambioDeMinuta = z
  .object({
    status: z.enum(["DRAFT", "REVIEWED", "EDITED"]).optional(),
    summary: z.string().max(20_000).optional(),
    agreements: z.array(Texto).max(100).optional(),
    decisions: z.array(Texto.extend({ rationale: z.string().max(4000).optional() })).max(100).optional(),
    risks: z.array(Texto.extend({ severity: z.enum(["low", "med", "high"]).optional() })).max(100).optional(),
    topics: z.array(z.string().max(500)).max(100).optional(),
  })
  .strict();

export type CambioDeMinutaPedido = z.infer<typeof CambioDeMinuta>;

/**
 * PATCH /api/projects/[projectId]/novedades/[hechoId]: decidir una novedad de un documento (memoria de la cuenta,
 * etapa 6). «usar» = el acuerdo del chat que la llevaba, o «Listo»; «desestimar» = «No aplica». `reemplazaAId`: el
 * acuerdo viejo que este reemplaza, solo si la persona lo confirma al usarlo (acuerdos vigentes).
 */
export const DecisionDeNovedad = z
  .object({
    accion: z.enum(["usar", "desestimar"]),
    pieza: z.string().min(1).max(60),
    nota: z.string().trim().max(500).optional(),
    reemplazaAId: z.string().min(1).max(60).optional(),
  })
  .strict();

export type PedidoDeDecisionDeNovedad = z.infer<typeof DecisionDeNovedad>;
