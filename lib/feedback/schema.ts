/**
 * lib/feedback/schema.ts — lo que entra a las rutas de /api/feedback (Zod en la frontera, ARCHITECTURE §3).
 */
import { z } from "zod";
import { COLUMNAS, MAX_CUERPO, MAX_MARCAS, TIPOS_DE_FEEDBACK } from "./reglas";

const texto = (max: number) => z.string().trim().max(max);
const rutaInterna = z.string().trim().max(1000).refine((r) => r.startsWith("/") && !r.startsWith("//"), "La dirección no es de Nexus.");

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
     * Solo para lo comentado desde la escala: la fila de «Cambios pendientes» del manual. La decisión
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
