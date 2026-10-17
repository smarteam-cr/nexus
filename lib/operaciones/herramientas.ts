/**
 * lib/operaciones/herramientas.ts — de una operación, la herramienta que ve el modelo (fase 0.4). PURO.
 *
 * El esquema sale del zod de la operación (`pide`), así lo que acepta el chat es exactamente lo que acepta la ruta. El
 * nombre de una herramienta no admite el punto («tarea.crear» → «tarea_crear»): la ida y la vuelta están acá.
 */
import { z } from "zod";
import type { ContextoDeOperacion, Operacion } from "./tipos";

export interface HerramientaDeOperacion {
  name: string;
  description: string;
  input_schema: { type: "object"; [k: string]: unknown };
}

/** El nombre de la herramienta: solo letras, números, «_» y «-» (lo que exige la API), hasta 64. */
export function nombreDeHerramienta(nombreDeOperacion: string): string {
  return nombreDeOperacion.replace(/\./g, "_").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64);
}

export function herramientaDe<C extends ContextoDeOperacion>(op: Operacion<C>): HerramientaDeOperacion {
  const schema = z.toJSONSchema(op.pide, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  if (schema.type !== "object") throw new Error(`La operación ${op.nombre} tiene que pedir un objeto.`);
  return {
    name: nombreDeHerramienta(op.nombre),
    description: op.clase === "propone" ? `${op.paraQue} Propone el cambio: se aplica cuando la persona lo confirma.` : op.paraQue,
    input_schema: schema as HerramientaDeOperacion["input_schema"],
  };
}

/** La operación de una herramienta que llamó el modelo, o null si no existe. */
export function operacionDeHerramienta<O extends Operacion>(operaciones: readonly O[], nombre: string): O | null {
  return operaciones.find((o) => nombreDeHerramienta(o.nombre) === nombre) ?? null;
}
