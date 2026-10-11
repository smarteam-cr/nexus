/**
 * lib/carga/schema.ts — la validación del guardado de los supuestos de la carga (Zod en la frontera).
 *
 * Los rangos son de cordura, no de política: frenan un dedazo (400 h de contrato, un peso de 50) sin decidir por la
 * CSL. Lo que no viene se completa con el valor de fábrica al leer (`completarConfig`), así que un formulario viejo no
 * rompe nada.
 */
import { z } from "zod";
import { CLAVES_DE_FAMILIA } from "@/lib/tiempos/familias";
import { PESOS, TIPOS_DE_FASE, TIPOS_DE_TRATO } from "./config";

const n = (min: number, max: number) => z.number().finite().min(min).max(max);
const porClave = <K extends string>(claves: readonly K[], valor: z.ZodNumber) =>
  z.object(Object.fromEntries(claves.map((k) => [k, valor])) as Record<K, z.ZodNumber>);

const capacidad = z.object({ horasContrato: n(1, 60), productiva: n(0.1, 1), paraCuentas: n(0, 1) });

export const configCargaSchema = z
  .object({
    capacidad,
    paraCuentasCsl: n(0, 1),
    preparacionMin: n(0, 120),
    horasPorTipo: porClave(TIPOS_DE_FASE, n(0, 40)),
    ambosFraccion: n(0, 1),
    pesos: porClave(PESOS, n(0, 2)),
    semaforo: z.object({ llena: n(1, 200), sobrecarga: n(1, 300) }),
    semanasSenal: z.number().int().min(1).max(12),
    traspaso: n(0, 2),
    semanasParaContratar: z.number().int().min(0).max(52),
    metaRecurrentes: z
      .object({ min: z.number().int().min(0).max(50), max: z.number().int().min(0).max(50) })
      .refine((m) => m.min <= m.max, { message: "Las recurrentes por CSE: «desde» no puede pasar a «hasta»." })
      .default({ min: 6, max: 7 }),
    horasPorTrato: porClave(TIPOS_DE_TRATO, n(0, 40)),
    personas: z.record(z.string().email(), capacidad.partial()),
    horasPorFamilia: z.partialRecord(z.enum(CLAVES_DE_FAMILIA), n(0, 80)).default({}),
    descartes: z.record(z.string().min(1).max(80), z.number().finite()).default({}),
  })
  .refine((c) => c.semaforo.llena < c.semaforo.sobrecarga, { message: "«Llena» tiene que empezar antes que «Sobrecarga».", path: ["semaforo"] });

export const guardarConfigCargaSchema = z.object({
  valores: configCargaSchema,
  motivo: z.string().trim().max(500).optional(),
});
