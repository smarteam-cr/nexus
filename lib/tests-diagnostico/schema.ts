/**
 * lib/tests-diagnostico/schema.ts — lo que entra por las rutas del test (públicas e internas), validado con Zod. PURO.
 */
import { z } from "zod";
import { DOMINIOS_PERSONALES, USOS_DE_CRM } from "./formulario";
import { VERSIONES_DEL_TEST } from "./tipos";

/** Las claves de origen que se guardan. */
export const CLAVE_DE_ORIGEN = /^(utm_[a-z_]{1,20}|gclid|fbclid|referrer|hutk|pagina)$/;

const corto = (max: number) => z.string().trim().max(max);
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

/** Empezar el test: la persona y su empresa (el formulario de hoy), el área y la versión. */
export const EmpezarTestSchema = z
  .object({
    area: z.enum(["ventas", "marketing", "servicio"]),
    version: z.enum(VERSIONES_DEL_TEST).default("web"),
    nombre: corto(120).min(2, "Escribe tu nombre."),
    /** Desde el 2026-10-28 el formulario lo pide aparte (como la aplicación vieja); se guarda junto al nombre. */
    apellido: opcional(120),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Escribe un correo válido.")
      .max(200)
      // La misma regla que la portada: el servidor no confía en que el navegador la haya aplicado.
      .refine((e) => !DOMINIOS_PERSONALES.has(e.split("@")[1] ?? ""), "Necesitamos tu correo corporativo (el de tu empresa)."),
    telefono: opcional(40),
    /** Lo mandaba la portada hasta el 2026-10-28; se sigue aceptando (una pestaña abierta desde antes del deploy). */
    puesto: opcional(120),
    /** Cómo gestionan hoy a sus clientes: un valor EXACTO de la propiedad de HubSpot (lo demás se rechaza). */
    usoDeCrm: z
      .enum(USOS_DE_CRM)
      .optional()
      .transform((v) => v ?? null),
    empresa: opcional(160),
    dominio: opcional(160).transform((v) => (v ? v.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : null)),
    industria: opcional(120),
    /** El campo trampa: una persona no lo ve, un script lo llena. */
    sitio: z.string().max(200).optional(),
    /**
     * De dónde llegó. Se guarda solo lo conocido (las utm_*, gclid, fbclid, la página, el referrer y la cookie de HubSpot),
     * hasta 12 claves de 300 caracteres: lo demás se descarta sin rechazar a la persona por un parámetro raro en la URL.
     * Un cuerpo con más de 40 claves sí se rechaza (nadie lo manda desde el formulario).
     */
    origen: z
      .record(z.string().max(60), z.string().max(2000))
      .refine((o) => Object.keys(o).length <= 40, "Demasiados datos de origen.")
      .transform((o) =>
        Object.fromEntries(
          Object.entries(o)
            .filter(([k]) => CLAVE_DE_ORIGEN.test(k))
            .slice(0, 12)
            .map(([k, v]) => [k, v.slice(0, 300)]),
        ),
      )
      .optional(),
  })
  .strict();

const RespuestasPublicasSchema = z.record(
  z.string().max(60),
  z.object({ opcion: z.string().min(1).max(60), matiz: z.string().max(1000).optional() }).strict(),
);

/** Contar una visita a la página de un test (O6 etapa 3): el área y la versión, nada más. */
export const VisitaSchema = z.object({ area: z.enum(["ventas", "marketing", "servicio"]), version: z.enum(VERSIONES_DEL_TEST) }).strict();

export const GuardarAvanceSchema = z.object({ respuestas: RespuestasPublicasSchema, paso: z.number().int().min(0).max(50) }).strict();
export const TerminarTestSchema = z.object({ respuestas: RespuestasPublicasSchema }).strict();

/** Lo que edita Elías del borrador: las preguntas enteras (el servidor revisa la forma con el lector tolerante). */
export const GuardarBorradorSchema = z
  .object({
    preguntas: z
      .array(
        z
          .object({
            id: z.string().min(1).max(60),
            dimensionId: z.string().min(1).max(20),
            texto: z.string().max(600),
            ayuda: z.string().max(600).nullable(),
            opciones: z.array(z.object({ id: z.string().min(1).max(60), texto: z.string().max(600), nivel: z.enum(["D", "I", "F", "E", "O"]) }).strict()).max(10),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
