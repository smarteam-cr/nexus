/**
 * lib/exploraciones/escala-con-nexus-esquemas.ts — lo que llega por la frontera de «✨ Pedirle a Nexus» en La escala (las
 * rutas de app/api/sales/exploraciones/[id]/escala/nexus y del historial de cada área). Aparte de ./escala-con-nexus.ts para
 * que la pantalla no cargue zod (lib/auth/client-safe.test.ts, C-24).
 */
import { z } from "zod";
import { MAX_PEDIDO } from "@/lib/pedirle-a-nexus/contrato";
import { CambiosParaAplicarSchema } from "@/lib/pedirle-a-nexus/esquemas";

/** El lugar como llega por la frontera. */
export const LugarEnLaEscalaSchema = z.discriminatedUnion("pagina", [
  z.object({ pagina: z.literal("resumen") }),
  z.object({ pagina: z.literal("area"), areaId: z.string().trim().min(1).max(80) }),
]);

/** Un pedido: dónde, qué y, si se pidió desde una pieza, cuál. */
export const PedidoALaEscalaSchema = z.object({
  lugar: LugarEnLaEscalaSchema,
  pedido: z.string().trim().min(1).max(MAX_PEDIDO),
  foco: z.string().max(400).nullish(),
});

/** Aplicar (o deshacer) lo que eligió la persona. */
export const AplicarEnLaEscalaSchema = z.object({
  lugar: LugarEnLaEscalaSchema,
  cambios: CambiosParaAplicarSchema,
  pedido: z.string().max(MAX_PEDIDO).nullish(),
});

/** «Deshacer» lo aplicado: la versión de antes y la huella de lo que dejó Nexus. */
export const DeshacerEnLaEscalaSchema = z.object({
  lugar: LugarEnLaEscalaSchema,
  deshacer: z.object({ versionId: z.string().min(1).max(60), firma: z.string().min(1).max(64) }),
});

/** Usar una versión de la página de un área: la huella de lo que ve la pantalla. */
export const UsarVersionDelAreaSchema = z.object({ firma: z.string().min(1).max(64) });
