/**
 * lib/feedback/schema.ts — lo que entra a las rutas de /api/feedback (Zod en la frontera, ARCHITECTURE §3).
 */
import { z } from "zod";
import { esRutaInterna } from "@/lib/navegacion/ruta-interna";
import { FORMA_DE_ANCLA } from "@/lib/escala/documento/anclas";
import { FORMA_DE_EDICION } from "@/lib/escala/documento/parsear";
import { CIERRES, DESPUES } from "@/lib/escala/documento/perfil";
import { COLUMNAS, MAX_CUERPO, MAX_MARCAS, TIPOS_DE_FEEDBACK } from "./reglas";

const texto = (max: number) => z.string().trim().max(max);
/** La bandeja la muestra como enlace: nunca una dirección afuera (`/\otro.com` también lo es). */
const rutaInterna = z.string().trim().max(1000).refine(esRutaInterna, "La dirección no es de Nexus.");

export const CrearReporte = z.object({
  tipo: z.enum(TIPOS_DE_FEEDBACK),
  cuerpo: texto(MAX_CUERPO).min(3, "Escribe qué pasó: con una frase alcanza."),
  meFrena: z.boolean().optional().default(false),
  pantalla: texto(200).min(1),
  ruta: rutaInterna,
  navegador: texto(120).optional(),
  ventana: texto(40).optional(),
  version: texto(60).optional(),
  errores: z.array(z.object({ mensaje: texto(300), hace: texto(40) })).max(10).optional(),
  capturaPath: z.string().max(300).optional(),
  marcas: z.array(z.object({ n: z.number().int().min(1).max(MAX_MARCAS), descripcion: texto(160) })).max(MAX_MARCAS).optional(),
  pedidoId: z.string().max(60).optional(),
  /**
   * Si se mandó desde un criterio, un nivel o una dimensión de la escala (lib/feedback/escala.ts): qué
   * se estaba leyendo. El texto NO viaja: lo congela el servidor desde la versión publicada.
   */
  escala: z
    .object({
      ancla: z.string().trim().regex(FORMA_DE_ANCLA, "Ese identificador no tiene la forma de la escala."),
      edicion: z.string().trim().max(80).regex(FORMA_DE_EDICION, "Esa no es la clave de una edición.").nullish(),
      perfilCierre: z.enum(CIERRES as unknown as [string, ...string[]]).nullish(),
      perfilDespues: z.enum(DESPUES as unknown as [string, ...string[]]).nullish(),
    })
    .optional(),
});
export type CrearReporte = z.infer<typeof CrearReporte>;

export const NuevoMensaje = z.object({
  cuerpo: texto(MAX_CUERPO).min(1, "Escribe la respuesta."),
});

export const Decidir = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("llevar"),
    /** Un tema que ya existe… */
    temaId: z.string().max(60).optional(),
    /** …o uno nuevo. */
    nuevo: z
      .object({
        titulo: texto(160).min(3, "Ponle un nombre al tema."),
        detalle: texto(400).optional(),
        columna: z.enum(COLUMNAS).default("decidir"),
      })
      .optional(),
    avisar: z.boolean().default(true),
    /**
     * Solo para lo mandado desde la escala: la fila de «Cambios pendientes» del manual. La decisión
     * la exige si el reporte es de la escala (lib/feedback/mutations.ts).
     */
    cambio: z
      .object({
        que: texto(2000).min(3, "Di qué cambiaría en la escala."),
        caso: texto(2000).default(""),
        decision: texto(2000).min(3, "Di qué decisión con el cliente cambiaría."),
      })
      .optional(),
  }),
  z.object({ accion: z.literal("responder"), respuesta: texto(MAX_CUERPO).min(1, "Escribe la respuesta.") }),
  z.object({ accion: z.literal("no_se_hara"), motivo: texto(600).min(3, "Escribe el motivo: la persona lo ve.") }),
  z.object({ accion: z.literal("deshacer") }),
  /** Sacar un reporte del tema en el que está y dejarlo en un tema propio, en la misma columna (2026-10-07). */
  z.object({ accion: z.literal("separar"), titulo: texto(160).min(3, "Ponle un nombre al tema.") }),
]);
export type Decidir = z.infer<typeof Decidir>;

export const CrearTema = z.object({
  titulo: texto(160).min(3, "Ponle un nombre al tema."),
  detalle: texto(400).optional(),
  pantalla: texto(80).optional(),
  columna: z.enum(COLUMNAS).default("decidir"),
  aNombreDe: texto(120).optional(),
});

export const CambiarTema = z.object({
  columna: z.enum(COLUMNAS).optional(),
  titulo: texto(160).min(3).optional(),
  detalle: texto(400).optional(),
});

export const CrearPedido = z.object({
  paraEmails: z.array(z.string().trim().toLowerCase().email()).min(1, "Elige a quién.").max(20),
  pantalla: texto(80).min(1),
  ruta: rutaInterna,
  pregunta: texto(400).min(5, "Escribe la pregunta."),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const MarcarPedido = z.object({
  accion: z.enum(["visto", "ahora_no"]),
});
