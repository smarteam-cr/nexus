/**
 * lib/auditoria-portal/schema.ts — LO QUE ACEPTAN LAS RUTAS DE AUDITORÍAS (Zod en la frontera).
 */
import { z } from "zod";

export const crearAuditoriaSchema = z.object({
  /** Portal de un cliente con conexión propia; sin él, el portal de Smarteam. */
  clientId: z.string().min(1).optional(),
  nombre: z.string().trim().max(120).optional(),
});

export const decidirHallazgosSchema = z.object({
  ids: z.array(z.string().regex(/^h\d{1,3}$/)).min(1).max(20),
  estado: z.enum(["confirmado", "descartado", "sugerido"]),
  /** El `generadoEn` del análisis que se ve: los ids (h1…) solo valen dentro de ese análisis. */
  generadoEn: z.string().min(1).max(64),
});

export const marcarRevisadoSchema = z.object({
  clave: z.string().min(1).max(80),
  revisado: z.boolean(),
  nota: z.string().trim().max(500).optional(),
});
