/**
 * lib/canvas/restaurar-bloque-schema.ts — el esquema del modo `restaurar` del POST de bloques.
 *
 * Aparte de ./restaurar-bloque.ts a propósito: ese lo importan componentes de cliente y zod no puede
 * viajar al navegador. Solo lo importan las rutas.
 */
import { z } from "zod";
import type { RestaurarBloque } from "./restaurar-bloque";

/** Un id de fila: los nuestros son cuid o UUID. ⛔ NO `z.string().cuid()`: hay UUID en la base. */
const ID_DE_FILA = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const datosJson = z
  .record(z.string(), z.unknown())
  .refine((v) => JSON.stringify(v).length <= 1_000_000, { message: "data supera 1 MB" });

/** Lo que viaja en `restaurar`. Estricto: un campo desconocido es 400. */
export const restaurarBloqueSchema = z.strictObject({
  id: ID_DE_FILA.optional(),
  source: z.enum(["AGENT", "HUMAN", "MODIFIED"]),
  status: z.enum(["DRAFT", "CONFIRMED"]),
  order: z.number().int().min(-1_000_000).max(1_000_000),
  colSpan: z.number().int().min(1).max(4).optional(),
  colStart: z.number().int().min(1).max(4).nullable().optional(),
  rowSpan: z.number().int().min(1).max(40).optional(),
  agentRunId: ID_DE_FILA.nullable().optional(),
  previousContent: z.string().max(200_000).nullable().optional(),
  previousData: datosJson.nullable().optional(),
  createdAt: z.string().max(40).optional(),
});

/* El tipo de la ruta y la interfaz del módulo puro no pueden separarse: si uno cambia, esto no compila. */
type DelEsquema = z.infer<typeof restaurarBloqueSchema>;
const _deIda: RestaurarBloque = {} as DelEsquema;
const _deVuelta: DelEsquema = {} as RestaurarBloque;
void _deIda;
void _deVuelta;