/**
 * lib/finanzas/caja/esquemas.ts — lo que aceptan las rutas de la caja (2026-11-13). Zod en la frontera (§3).
 */
import { z } from "zod";
import { ADELANTO_MAXIMO_PCT, CATEGORIAS_DE_PAGO } from "./politica";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.");
const moneda = z.enum(["CRC", "USD"]);
/** Una sociedad de la lista oficial (`SociedadPropia.id`), o ninguna. Que exista lo comprueba la mutación. */
const sociedadId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .nullish()
  .transform((v) => v ?? null);
const texto = (max: number) => z.string().trim().max(max);
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const saldoSchema = z.object({
  cuentaId: z.string().min(1),
  fecha,
  /** Puede ser negativo: un sobregiro también es un saldo. */
  monto: z.number().finite().gt(-1e12).lt(1e12),
  nota: textoOpcional(500),
});

export const cuentaNuevaSchema = z.object({
  nombre: texto(120).min(1, "Ponle nombre a la cuenta."),
  moneda,
  sociedadId,
});

export const cuentaCambioSchema = z
  .object({
    nombre: texto(120).min(1).optional(),
    sociedadId: sociedadId.optional(),
    activa: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No hay nada que cambiar.");

const camposDeCompromiso = {
  tipo: z.enum(["PAGO", "RESERVA"]),
  concepto: texto(200).min(1, "Di qué es."),
  beneficiario: textoOpcional(200),
  categoria: z.enum(CATEGORIAS_DE_PAGO),
  monto: z.number().finite().positive("El monto tiene que ser mayor que cero.").lt(1e12),
  moneda,
  fecha: fecha.nullish().transform((v) => v ?? null),
  facturaRecibidaEl: fecha.nullish().transform((v) => v ?? null),
  entregadoEl: fecha.nullish().transform((v) => v ?? null),
  adelantoPct: z.number().int().min(0).max(ADELANTO_MAXIMO_PCT, `El adelanto es de hasta ${ADELANTO_MAXIMO_PCT} %.`).default(0),
  cobroId: z.string().min(1).nullish().transform((v) => v ?? null),
  sociedadId,
  nota: textoOpcional(2000),
};

export const compromisoSchema = z
  .object(camposDeCompromiso)
  .refine((v) => v.tipo !== "RESERVA" || v.fecha !== null, { message: "Una reserva necesita para cuándo es.", path: ["fecha"] });

export type CompromisoInput = z.infer<typeof compromisoSchema>;

export const accionDeCompromisoSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("pagar"), fecha }),
  z.object({ accion: z.literal("pagarAdelanto"), fecha }),
  z.object({ accion: z.literal("anular") }),
  z.object({ accion: z.literal("reabrir") }),
  z.object({ accion: z.literal("editar"), datos: compromisoSchema }),
]);

export const revisionSchema = z.object({ nota: textoOpcional(1000) });
