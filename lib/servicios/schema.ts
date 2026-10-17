/**
 * lib/servicios/schema.ts — validación (Zod) de lo que entra a las rutas del ciclo. Servidor.
 */
import { z } from "zod";
import { COMPROMISOS, ETAPAS_DEL_CICLO } from "./ciclo";

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.").nullable();
const textoCorto = z.string().max(200).nullable();
const textoLargo = z.string().max(4000).nullable();

export const abrirCicloSchema = z.object({
  nombre: textoCorto.optional(),
  desde: dia.optional(),
  hasta: dia.optional(),
  meta: textoLargo.optional(),
});

export const actualizarCicloSchema = z
  .object({
    nombre: textoCorto.optional(),
    desde: dia.optional(),
    hasta: dia.optional(),
    meta: textoLargo.optional(),
    etapa: z.enum(ETAPAS_DEL_CICLO).optional(),
    compromiso: z.enum(COMPROMISOS).nullable().optional(),
  })
  .strict();

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

export const crearCasoSchema = z.object({ titulo: z.string().trim().min(1).max(200), ...datosDeCaso }).strict();

export const actualizarCasoSchema = z
  .object({ id: z.string().min(1), titulo: z.string().max(200).optional(), quitar: z.boolean().optional(), ...datosDeCaso })
  .strict();

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
