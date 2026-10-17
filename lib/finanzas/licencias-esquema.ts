/**
 * lib/finanzas/licencias-esquema.ts — el esquema de la frontera para cargar un contrato con licencias (2026-10-17).
 * Las reglas de fondo están en lib/finanzas/licencias.ts (`problemasDeLicencia`): acá solo la forma.
 */
import { z } from "zod";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fecha = z.string().regex(FECHA, "Las fechas van como AAAA-MM-DD.").nullable();
const moneda = z.enum(["USD", "CRC"]);

export const licenciaSchema = z.object({
  cuentaId: z.string().min(1).max(40),
  moneda,
  montoContrato: z.number().positive().max(1_000_000_000),
  montoServicio: z.number().min(0).max(1_000_000_000),
  proveedor: z.string().trim().min(1).max(60),
  costoMonto: z.number().min(0).max(1_000_000_000).nullable(),
  costoMoneda: moneda.nullable(),
  costoCadaMeses: z.number().int().min(1).max(36).nullable(),
  desde: fecha,
  hasta: fecha,
  fuente: z.string().trim().min(1, "Di de dónde salen los números.").max(500),
  notas: z.string().trim().max(2000).nullable(),
});
