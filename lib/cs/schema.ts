/**
 * lib/cs/schema.ts — lo que entra por la frontera de Éxito del cliente (ARCHITECTURE §3).
 */
import { z } from "zod";
import { esValorDe, type DatoDeClasificacion } from "./clasificacion";
import { LARGO_DE_LA_NOTA, SALUDES_CORREGIBLES } from "./ajustes-de-salud";

const datoSchema = z.enum(["relacion", "potencial", "momento"]);

const operacionSchema = z
  .discriminatedUnion("accion", [
    z.object({ accion: z.literal("confirmar"), dato: datoSchema, valor: z.string().min(1).max(40) }),
    z.object({ accion: z.literal("descartar"), dato: datoSchema, valor: z.string().min(1).max(40), huella: z.string().min(1).max(600) }),
  ])
  .refine((op) => esValorDe(op.dato as DatoDeClasificacion, op.valor), { message: "Ese valor no existe para ese dato." });

const operacionesSchema = z.array(operacionSchema).min(1).max(6);

/** PATCH /api/cs/clasificacion/[clientId]: hasta tres operaciones («Usar las 3 propuestas» va en una). */
export const clasificacionPatchSchema = z.object({ operaciones: operacionesSchema });

/**
 * POST /api/cs/clasificacion: «Usar las propuestas» de las cuentas que se ven. Tope de 300 cuentas: la cartera
 * entera de clientes cabe (168 el 2026-10-07) y un pedido más grande es un error.
 */
export const clasificacionEnBloqueSchema = z.object({
  cuentas: z
    .array(z.object({ clientId: z.string().min(1).max(40), operaciones: operacionesSchema }))
    .min(1)
    .max(300),
});

export type ClasificacionPatch = z.infer<typeof clasificacionPatchSchema>;

const notaSchema = z.string().trim().min(3, "Escribe la razón en una línea.").max(LARGO_DE_LA_NOTA, `Hasta ${LARGO_DE_LA_NOTA} caracteres.`);

/**
 * POST /api/cs/salud/[clientId]: corregir el color de la cuenta o marcar «en espera del cliente» (2026-10-09,
 * lib/cs/ajustes-de-salud.ts). Corregir y marcar en espera piden una nota: es lo que lee el resto del equipo.
 */
export const ajusteDeSaludSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("corregir"), salud: z.enum(SALUDES_CORREGIBLES), nota: notaSchema }),
  z.object({ accion: z.literal("quitar-correccion") }),
  z.object({ accion: z.literal("en-espera"), nota: notaSchema }),
  z.object({ accion: z.literal("quitar-espera") }),
  z.object({ accion: z.literal("descartar-espera"), huella: z.string().min(1).max(2000) }),
]);
export type AjusteDeSaludPedido = z.infer<typeof ajusteDeSaludSchema>;

/** POST /api/cs/vistas: guardar los filtros de la pestaña «Cartera» con un nombre (2026-10-09, entrega 3). */
export const vistaDeCarteraSchema = z.object({
  nombre: z.string().trim().min(2, "Ponle un nombre.").max(60, "Hasta 60 caracteres."),
  filtros: z.record(z.string(), z.unknown()),
});
