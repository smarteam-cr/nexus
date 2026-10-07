/**
 * lib/procesos/schema.ts — LO QUE ACEPTAN LAS RUTAS DE PROCESOS (frontera, ARCHITECTURE §3).
 */
import { z } from "zod";
import { CAMBIOS, ESTADOS, ORIGENES, TIPOS_DE_CARRIL, TIPOS_DE_PASO } from "./mapa";
import { TOPES } from "./operaciones";

const cual = z.enum(["hoy", "despues"]);
/** Un id que ya está en el mapa (los del agente pueden traer espacios o tildes). */
const id = z.string().min(1).max(80);
/** Un id que crea el editor. */
const idNuevo = z.string().regex(/^[\w-]{1,40}$/);
const texto = (max: number) => z.string().max(max);

const citaSchema = z.strictObject({
  sesionId: z.string().min(1).max(64),
  sesionTitulo: z.string().max(300),
  fecha: z.string().max(10),
  cita: z.string().min(12).max(400),
  minuto: z.string().max(12).optional(),
  quien: z.string().max(120).optional(),
});

const cambiosDelPaso = z.strictObject({
  texto: texto(TOPES.texto).optional(),
  carril: id.optional(),
  tipo: z.enum(TIPOS_DE_PASO).optional(),
  herramienta: texto(TOPES.herramienta).optional(),
  dolor: texto(TOPES.dolor).optional(),
  origen: z.enum(ORIGENES).optional(),
  cambio: z.enum(CAMBIOS).optional(),
  enHubspot: texto(TOPES.enHubspot).optional(),
  reemplaza: z.array(id).max(TOPES.pasos).optional(),
});

/** Una operación del editor (lib/procesos/operaciones.ts): la misma forma que va a usar el chat. */
export const operacionSchema = z.discriminatedUnion("tipo", [
  z.strictObject({
    tipo: z.literal("paso.agregar"),
    version: cual,
    paso: z.strictObject({ id: idNuevo, carril: id, texto: texto(TOPES.texto), tipo: z.enum(TIPOS_DE_PASO) }),
    despuesDe: id.nullable().optional(),
  }),
  z.strictObject({ tipo: z.literal("paso.editar"), version: cual, pasoId: id, cambios: cambiosDelPaso }),
  z.strictObject({ tipo: z.literal("paso.quitar"), version: cual, pasoId: id }),
  z.strictObject({ tipo: z.literal("cita.agregar"), version: cual, pasoId: id, cita: citaSchema }),
  z.strictObject({ tipo: z.literal("cita.quitar"), version: cual, pasoId: id, sesionId: z.string().min(1).max(64), cita: z.string().max(400) }),
  z.strictObject({ tipo: z.literal("flecha.agregar"), version: cual, de: id, a: id, etiqueta: texto(TOPES.etiqueta).optional() }),
  z.strictObject({ tipo: z.literal("flecha.editar"), version: cual, de: id, a: id, etiqueta: texto(TOPES.etiqueta) }),
  z.strictObject({ tipo: z.literal("flecha.quitar"), version: cual, de: id, a: id }),
  z.strictObject({
    tipo: z.literal("carril.agregar"),
    version: cual,
    carril: z.strictObject({ id: idNuevo, nombre: texto(TOPES.nombreDeCarril), tipo: z.enum(TIPOS_DE_CARRIL) }),
  }),
  z.strictObject({ tipo: z.literal("carril.editar"), version: cual, carrilId: id, nombre: texto(TOPES.nombreDeCarril).optional(), tipoDeCarril: z.enum(TIPOS_DE_CARRIL).optional() }),
  z.strictObject({ tipo: z.literal("carril.mover"), version: cual, carrilId: id, hacia: z.enum(["arriba", "abajo"]) }),
  z.strictObject({ tipo: z.literal("carril.quitar"), version: cual, carrilId: id }),
]);

export const cambioDeMapaSchema = z.discriminatedUnion("accion", [
  z.strictObject({ accion: z.literal("estado"), estado: z.enum(ESTADOS) }),
  // Lo que se hizo en el editor de pantalla completa, sobre la versión del mapa que tenía abierta.
  z.strictObject({
    accion: z.literal("operaciones"),
    version: z.number().int().min(0),
    operaciones: z.array(operacionSchema).min(1).max(300),
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
