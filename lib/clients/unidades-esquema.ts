/**
 * lib/clients/unidades-esquema.ts — lo que llega por la ruta de «Unidades de negocio» (app/api/clients/[id]/unidades).
 * Aparte de lib/clients/unidades.ts para que la pantalla, que importa constantes de allá, no cargue zod (C-24).
 */
import { z } from "zod";

/** El pedido de la pantalla: ver qué cambia (`simular`) o guardar lo que se vio. */
export const PedidoDeUnidadSchema = z
  .object({
    accion: z.enum(["simular", "guardar"]),
    fichaId: z.string().min(1).max(64).optional(),
    nombre: z.string().max(200).optional(),
    siglas: z.array(z.string().max(20)).max(10),
    dominios: z.array(z.string().max(253)).max(20),
    proyectos: z.array(z.string().min(1).max(64)).max(50).optional(),
    asignar: z.record(z.string().min(1).max(128), z.string().min(1).max(64)).optional(),
    moverIgual: z.array(z.string().min(1).max(128)).max(500).optional(),
    huella: z.string().max(64).optional(),
  })
  /* Con `fichaId`, los proyectos pasan solo de la empresa arriba a esa unidad: lo comprueba unidades-server.ts › calcular. */
  .strict();

export const PedidoDeJuntarSchema = z.object({ unidadId: z.string().min(1).max(64) }).strict();
