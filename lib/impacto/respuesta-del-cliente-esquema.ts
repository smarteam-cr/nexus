/**
 * lib/impacto/respuesta-del-cliente-esquema.ts — el esquema Zod de un hito nuevo (./respuesta-del-cliente.ts). Aparte a
 * propósito: un componente de cliente que importa el módulo puro no se lleva zod al navegador (lib/auth/client-safe.test.ts).
 */
import { z } from "zod";
import { MAX_NOTA_DE_LA_RESPUESTA, type NuevoHito } from "./respuesta-del-cliente";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** Un día que existe: «2026-02-31» o el mes 13 no pasan (la tabla no se corrige después). */
const esUnDia = (s: string) => DIA.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

export const NuevoHitoSchema: z.ZodType<NuevoHito> = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("presentada"), fecha: z.string().refine((s) => { try { return esUnDia(s); } catch { return false; } }) }),
  z.object({ tipo: z.literal("acepto"), nota: z.string().trim().max(MAX_NOTA_DE_LA_RESPUESTA).optional() }),
  z.object({ tipo: z.literal("acepto-con-cambios"), nota: z.string().trim().min(3).max(MAX_NOTA_DE_LA_RESPUESTA) }),
  z.object({ tipo: z.literal("pidio-ajustes"), nota: z.string().trim().min(3).max(MAX_NOTA_DE_LA_RESPUESTA) }),
]);
