/**
 * lib/tareas/schema.ts — la validación de las rutas de Tareas internas (Zod en la frontera). SERVIDOR.
 */
import { z } from "zod";
import { MAX_NOTAS, MAX_TITULO } from "./reglas";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const id = z.string().min(1).max(64);
const correo = z.string().email().max(200);
const prioridad = z.enum(["alta", "media", "baja"]);
const minutos = z.number().int().min(1).max(14_400);
const etiquetas = z.array(z.string().min(1).max(40)).max(5);

export const CrearTarea = z.object({
  titulo: z.string().trim().min(1, "Escribe qué hay que hacer.").max(MAX_TITULO),
  notas: z.string().max(MAX_NOTAS).nullish(),
  para: correo.nullish(),
  paraEquipo: z.string().max(40).nullish(),
  cuando: z.union([z.enum(["esta_semana", "proxima_semana", "sin_semana"]), fecha]).nullish(),
  prioridad: prioridad.optional(),
  minutosEstimados: minutos.nullish(),
  venceEl: fecha.nullish(),
  clientId: id.nullish(),
  projectId: id.nullish(),
  proyectoId: id.nullish(),
  privada: z.boolean().optional(),
  seccion: z.string().max(60).nullish(),
  etiquetas: etiquetas.optional(),
});

/** «Ya lo guardé» de un evento con cuenta (fase 2, 2026-10-17): la reunión planeada de la persona. */
export const PlanearReunion = z.object({
  clientId: id,
  titulo: z.string().trim().min(1, "La reunión necesita un título.").max(200),
  inicio: z.string().datetime({ offset: true, message: "La hora de la reunión no es válida." }),
  invitados: z.array(z.string().trim().max(200)).max(30).optional(),
  objetivo: z.string().trim().max(1_000).nullish(),
  /** La reunión cuya próxima es: la tarea queda atada a ella (`proxima:<reunión>`). */
  deLaReunion: z.string().min(1).max(200).nullish(),
});

const Cambios = z.object({
  titulo: z.string().trim().min(1).max(MAX_TITULO).optional(),
  notas: z.string().max(MAX_NOTAS).nullish(),
  prioridad: prioridad.optional(),
  minutosEstimados: minutos.nullish(),
  venceEl: fecha.nullish(),
  clientId: id.nullish(),
  projectId: id.nullish(),
  proyectoId: id.nullish(),
  privada: z.boolean().optional(),
  seccion: z.string().max(60).nullish(),
  etiquetas: etiquetas.optional(),
  /** El contacto y el negocio de HubSpot (ids externos), entre los de su cliente: seguimiento comercial (D4). */
  hubspotContactId: z.string().regex(/^\d{1,20}$/, "Ese contacto no es válido.").nullish(),
  hubspotDealId: z.string().regex(/^\d{1,20}$/, "Ese negocio no es válido.").nullish(),
});

export const PatchTarea = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("editar"), version: z.number().int(), cambios: Cambios }),
  z.object({ accion: z.literal("estado"), version: z.number().int(), hacia: z.enum(["pendiente", "en_curso", "hecha", "no_se_hara"]), motivo: z.string().max(500).nullish() }),
  z.object({ accion: z.literal("semana"), version: z.number().int(), destino: fecha.nullable() }),
  z.object({ accion: z.literal("asignar"), version: z.number().int(), para: correo }),
]);

export const DecidirTarea = z.object({
  version: z.number().int(),
  decision: z.discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("usar"), cambios: Cambios.optional(), usarClienteSugerido: z.boolean().optional() }),
    z.object({ tipo: z.literal("mas_adelante"), desde: fecha.nullish() }),
    z.object({ tipo: z.literal("rechazar"), motivo: z.string().max(500).nullish() }),
    z.object({ tipo: z.literal("no_es_mia"), para: correo }),
    z.object({ tipo: z.literal("misma"), otraId: id }),
    z.object({ tipo: z.literal("retirar") }),
  ]),
});

export const RevisarSemana = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("responder"),
    semana: fecha,
    tareaId: id,
    resultado: z.enum(["hecha", "sigue", "mas_adelante", "no_se_hara"]),
    desde: fecha.nullish(),
    motivo: z.string().max(500).nullish(),
  }),
  z.object({ accion: z.literal("cerrar"), semana: fecha, persona: correo.optional() }),
]);

const Bloque = z.object({ inicio: z.string().datetime(), fin: z.string().datetime() });

export const Agendar = z.discriminatedUnion("modo", [
  /** Nexus crea los bloques en tu calendario. */
  z.object({ modo: z.literal("crear"), bloques: z.array(Bloque).min(1).max(8), minutos: minutos.optional() }),
  /** Lo guardaste tú con el enlace de plantilla («Ya la agendé»). */
  z.object({ modo: z.literal("ya_la_agende"), bloques: z.array(Bloque).min(1).max(8), minutos: minutos.optional() }),
  /** Quitar los bloques (de tu calendario) y dejarla sin agendar. */
  z.object({ modo: z.literal("quitar") }),
  /** Unirla a un evento que YA está en tu calendario (P3): Nexus lo verifica allá y nunca lo mueve ni lo borra. */
  z.object({ modo: z.literal("asociar"), eventoId: z.string().trim().min(1).max(300) }),
]);

export const LeerReunion = z.object({
  sessionId: id,
  rol: z.enum(["planning", "cierre", "ambos"]).optional(),
  equipo: z.string().max(80).optional(),
  avisarIgual: z.boolean().optional(),
});

export const CrearProyecto = z.object({
  nombre: z.string().trim().min(1, "Ponle un nombre al proyecto.").max(120),
  espacioId: id.nullish(),
  responsableEmail: correo.nullish(),
  descripcion: z.string().max(MAX_NOTAS).nullish(),
  iniciaEl: fecha.nullish(),
  venceEl: fecha.nullish(),
  clientId: id.nullish(),
  projectId: id.nullish(),
});

export const PatchProyecto = z.object({
  version: z.number().int(),
  cambios: z.object({
    nombre: z.string().trim().min(1).max(120).optional(),
    descripcion: z.string().max(MAX_NOTAS).nullish(),
    responsableEmail: correo.nullish(),
    iniciaEl: fecha.nullish(),
    venceEl: fecha.nullish(),
    clientId: id.nullish(),
    projectId: id.nullish(),
    estado: z.enum(["activo", "en_pausa", "terminado"]).optional(),
    secciones: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  }),
});

export const DecidirProyecto = z.object({
  version: z.number().int(),
  decision: z.enum(["usar", "descartar"]),
  nombre: z.string().trim().min(1).max(120).optional(),
  responsableEmail: correo.nullish(),
});

/** Un comentario en una tarea: hasta 4.000 caracteres (lo exige también un CHECK en la base). */
export const Comentar = z.object({ cuerpo: z.string().trim().min(1, "Escribe el comentario.").max(4_000) });

export const PatchComentario = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("editar"), cuerpo: z.string().trim().min(1, "Escribe el comentario.").max(4_000) }),
  z.object({ accion: z.literal("archivar") }),
]);

/** «Esperar a…»: la tarea que la bloquea. */
export const EsperarA = z.object({ esperaA: id });

/** Un espacio libre («Evento SmartAgro»): nombre, quién lo ve y sus miembros. Quien lo crea queda como admin. */
export const CrearEspacio = z.object({
  nombre: z.string().trim().min(1, "Ponle un nombre al espacio.").max(80),
  visibilidad: z.enum(["miembros", "todos"]).default("miembros"),
  miembros: z.array(correo).max(40).default([]),
});

export const PatchEspacio = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("editar"), version: z.number().int(), nombre: z.string().trim().min(1).max(80).optional(), visibilidad: z.enum(["miembros", "todos"]).optional() }),
  z.object({ accion: z.literal("archivar"), version: z.number().int() }),
  z.object({ accion: z.literal("sumar"), email: correo }),
  z.object({ accion: z.literal("quitar"), email: correo }),
]);

/** Vincular un registro: un enlace de HubSpot, una propuesta comercial o una preventa (por su id). */
export const Vincular = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("hubspot"), url: z.string().trim().min(1, "Pega el enlace del registro.").max(500) }),
  z.object({ tipo: z.literal("propuesta"), id }),
  z.object({ tipo: z.literal("preventa"), id }),
]);

/* El sprint de cada equipo (ficha A, 2026-10-17): la serie de su reunión y quiénes están. */
const rolDeReunion = z.enum(["planning", "cierre", "ambos"]);

export const CrearFuente = z.object({
  equipo: z.string().min(1).max(40),
  sessionId: id,
  rol: rolDeReunion.optional(),
  personas: z.array(correo).max(40).optional(),
});

export const CambiarFuente = z
  .object({
    activa: z.boolean().optional(),
    rol: rolDeReunion.optional(),
    personas: z.array(correo).max(40).optional(),
  })
  .refine((c) => c.activa !== undefined || c.rol !== undefined || c.personas !== undefined, "No hay nada que cambiar.");

/** «Proponérmelas»: lo que el tope de 5 por persona dejó fuera de una lectura (lib/tareas/lectura.ts). */
export const ProponerLoDeFuera = z.object({ lecturaId: z.string().min(1).max(60) });
