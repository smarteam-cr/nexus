/**
 * lib/procesos/schema.ts — LO QUE ACEPTAN LAS RUTAS DE PROCESOS (frontera, ARCHITECTURE §3).
 */
import { z } from "zod";
import { ESTADOS, ORIGENES } from "./mapa";

export const cambioDeMapaSchema = z.discriminatedUnion("accion", [
  z.strictObject({ accion: z.literal("estado"), estado: z.enum(ESTADOS) }),
  z.strictObject({
    accion: z.literal("paso"),
    version: z.enum(["hoy", "despues"]),
    pasoId: z.string().min(1).max(40),
    texto: z.string().max(200),
    carril: z.string().min(1).max(80),
    herramienta: z.string().max(120),
    dolor: z.string().max(200),
    origen: z.enum(ORIGENES),
    quitarCitas: z.array(z.number().int().min(0).max(10)).max(10),
  }),
  // Un mapa del formato anterior editado en el visor viejo (sus nodos y flechas, tal cual los guarda).
  z.strictObject({
    accion: z.literal("anterior"),
    data: z.object({
      nodes: z.array(z.object({ id: z.string().min(1).max(80) }).passthrough()).max(300),
      edges: z.array(z.object({ source: z.string().min(1).max(80), target: z.string().min(1).max(80) }).passthrough()).max(600),
      description: z.string().max(4000).optional(),
    }),
  }),
]);
export type CambioDeMapa = z.infer<typeof cambioDeMapaSchema>;
