/**
 * lib/servicios/schema.ts — validación (Zod) de lo que entra a las rutas del servicio y de los casos de uso. Servidor.
 */
import { z } from "zod";
import { ETAPAS_DEL_CICLO } from "./ciclo";

const textoCorto = z.string().max(200).nullable();
const textoLargo = z.string().max(4000).nullable();

const movimiento = z.object({
  area: z.string().max(60),
  dimension: z.string().min(1).max(120),
  nivel: z.string().max(40),
});

const datosDeCaso = {
  resultado: textoLargo.optional(),
  mueve: z.array(movimiento).max(24).optional(),
  porque: textoLargo.optional(),
  criterio: textoLargo.optional(),
  metrica: textoCorto.optional(),
};

/** Un caso de uso de la EMPRESA (La cuenta › Casos de uso): al plan de crecimiento o al ciclo abierto de un proyecto. */
export const crearCasoDeLaEmpresaSchema = z
  .object({
    titulo: z.string().trim().min(1).max(200),
    projectId: z.string().min(1).max(60).nullable().optional(),
    /** Viene del camino de crecimiento de La cuenta › La escala (ficha B): nace SUGERIDO y con origen «escala». */
    deLaEscala: z.boolean().optional(),
    ...datosDeCaso,
  })
  .strict();

export const actualizarCasoDeLaEmpresaSchema = z
  .object({
    titulo: z.string().max(200).optional(),
    quitar: z.boolean().optional(),
    estado: z.enum(["sugerido", "en_plan", "cumplido", "no_cumplido"]).optional(),
    ...datosDeCaso,
  })
  .strict();

/**
 * La guía del servicio recurrente de un proyecto (POST /api/projects/[id]/servicio, iniciativa 4): pasar a recurrente,
 * crear las tareas de la rutina o decir que una reunión fija ya se agendó.
 */
export const accionDelServicioSchema = z.discriminatedUnion("accion", [
  z
    .object({
      accion: z.literal("pasar"),
      servicio: z.string().trim().min(1).max(60),
      etapa: z.enum(ETAPAS_DEL_CICLO).nullable().optional(),
    })
    .strict(),
  z.object({ accion: z.literal("tareas") }).strict(),
  z.object({ accion: z.literal("agendada"), clave: z.string().trim().min(1).max(60) }).strict(),
]);
