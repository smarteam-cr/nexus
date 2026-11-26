/**
 * lib/clients/interlocutores-esquema.ts — el cuerpo de un cambio de interlocutor (PUT /api/clients/[id]/interlocutores),
 * validado con Zod en la frontera (ARCHITECTURE §3). Aparte de lib/clients/interlocutores.ts para que la pantalla no
 * cargue zod (lib/auth/client-safe.test.ts, C-24).
 */
import { z } from "zod";
import { CORREO, type PedidoDeInterlocutor } from "./interlocutores";
import { ROLES_DE_PERSONA } from "./roles-de-persona";

const textoCorto = z
  .string()
  .max(200)
  .transform((s) => s.trim().slice(0, 120) || null)
  .nullable()
  .optional();
const fichas = z
  .array(z.string().min(1).max(40))
  .max(30)
  .transform((l) => [...new Set(l)])
  .optional();

/** El cuerpo de un cambio (PUT /api/clients/[id]/interlocutores). `simular`: solo contar las reuniones que se moverían. */
export const CambioDeInterlocutorSchema = z.object({
  correo: z
    .string()
    .max(200)
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => CORREO.test(s), "Ese correo no es válido."),
  nombre: textoCorto,
  cargo: textoCorto,
  rol: z.enum(ROLES_DE_PERSONA).nullable().optional(),
  confirmadaEn: fichas,
  sugeridaEn: fichas,
  otras: z.object({ sumar: fichas, quitar: fichas }).optional(),
  huella: z.string().max(100).optional(),
  simular: z.boolean().optional(),
});

/** Valida el cuerpo de un cambio. Devuelve el cambio limpio (y si es simulacro) o el motivo. PURO. */
export function leerCambio(b: unknown): { ok: true; pedido: PedidoDeInterlocutor; simular: boolean } | { ok: false; error: string } {
  const r = CambioDeInterlocutorSchema.safeParse(b);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "El cambio no es válido." };
  const { simular, ...pedido } = r.data;
  return { ok: true, pedido, simular: simular ?? false };
}
