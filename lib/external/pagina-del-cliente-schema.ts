/**
 * lib/external/pagina-del-cliente-schema.ts — la VALIDACIÓN de lo que el equipo guarda de la página del cliente
 * (2026-11-27). Solo la usan las rutas (servidor): zod pesa 266 KB y las pantallas no lo necesitan para pintar (C-24,
 * lib/auth/client-safe.test.ts). La forma, los valores de siempre y las constantes viven sin zod en
 * lib/external/pagina-del-cliente.ts.
 */
import { z } from "zod";
import { BIENVENIDA_MAX, TITULO_MAX, type PaginaDelCliente } from "./pagina-del-cliente";

/** Lo que se guarda. Escritura estricta: un campo desconocido es un error, no se guarda en silencio. */
export const PaginaDelClienteSchema = z
  .object({
    titulo: z.string().max(TITULO_MAX).optional(),
    conNombre: z.boolean().optional(),
    conLogo: z.boolean().optional(),
    bienvenida: z.string().max(BIENVENIDA_MAX).optional(),
    conAtrasadas: z.boolean().optional(),
    conResponsables: z.boolean().optional(),
    conResumen: z.boolean().optional(),
  })
  .strict() satisfies z.ZodType<PaginaDelCliente>;
