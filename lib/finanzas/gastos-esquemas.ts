/**
 * lib/finanzas/gastos-esquemas.ts — los esquemas de las rutas de gastos sin salarios (rediseño de Finanzas, 2026-10-03).
 *
 * Son los mismos de Costos, sin la categoría Salario ni lo que solo usa un salario (persona del equipo, base y factor de
 * cargas): desde las pantallas de quien registra no se puede crear ni convertir un costo en salario. PURO, para poder
 * probarlo (gastos.test.ts).
 */
import { z } from "zod";
import { costoCreateSchema, costoPatchSchema } from "@/lib/cobranza/schema";
import { esCategoriaSinSalario } from "./gastos";

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
