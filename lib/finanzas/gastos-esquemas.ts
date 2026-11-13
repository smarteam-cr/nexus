/**
 * lib/finanzas/gastos-esquemas.ts — los esquemas de las rutas de gastos sin salarios (rediseño de Finanzas, 2026-10-03).
 *
 * Son los mismos de Costos, sin la categoría Salario ni lo que solo usa un salario (persona del equipo, base y factor de
 * cargas): desde las pantallas de quien registra no se puede crear ni convertir un costo en salario. PURO, para poder
 * probarlo (gastos.test.ts).
 */
import { z } from "zod";
import { COSTOS_FRECUENCIAS, costoCreateSchema, costoPatchSchema } from "@/lib/cobranza/schema";
import { CATEGORIAS_SIN_SALARIO, esCategoriaSinSalario } from "./gastos";

const sinCamposDeSalario = { message: "Ese dato es de la planilla", path: ["teamMemberId"] };

export const recurrenteCreateSchema = costoCreateSchema
  .refine((d) => esCategoriaSinSalario(d.categoria), { message: "Elige herramienta o fijo de operación", path: ["categoria"] })
  .refine((d) => d.teamMemberId == null && d.montoBase == null && d.factorCargas == null, sinCamposDeSalario);

export const recurrentePatchSchema = costoPatchSchema
  .refine((d) => d.categoria === undefined || esCategoriaSinSalario(d.categoria), {
    message: "Elige herramienta o fijo de operación",
    path: ["categoria"],
  })
  .refine((d) => d.teamMemberId == null && d.montoBase == null && d.factorCargas == null, sinCamposDeSalario);

export const gastosListosSchema = z.object({
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido"),
  listos: z.boolean(),
});

/** «Ya tengo la factura» (2026-11-13): su número o el enlace al archivo. null = quitarla (se anotó en el gasto equivocado). */
export const comprobanteSchema = z
  .object({ comprobante: z.string().trim().min(1, "Escribe el número de la factura o pega el enlace").max(500).nullable() })
  .strict();

/**
 * «Este gasto se repite» (2026-11-13): el gasto puntual se vuelve un fijo. Solo herramienta o fijo de operación (nunca un
 * salario: lo que se anota acá lo ve quien registra). El monto, la moneda y el nombre salen del gasto.
 */
export const volverFijoSchema = z
  .object({
    categoria: z.enum(CATEGORIAS_SIN_SALARIO),
    frecuencia: z.enum(COSTOS_FRECUENCIAS),
    presupuesto: z.number().positive("El presupuesto debe ser positivo").multipleOf(0.01, "Máximo 2 decimales").nullable().optional(),
  })
  .strict();
