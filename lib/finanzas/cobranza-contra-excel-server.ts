/**
 * lib/finanzas/cobranza-contra-excel-server.ts
 *
 * Lo que toca la base para poner el último Excel de Alex al lado de la cobranza del reporte: el lote
 * guardado y lo que Nexus tiene para compararlo. La cuenta vive en `cobranza-contra-excel.ts`, que es
 * puro. SOLO LECTURA: no escribe el lote, ni un cobro, ni el espejo de Odoo.
 *
 * Lee lo mismo que Cobranza › Importar (`cargarContextoLibro` + `compararLibro`), a propósito: si esta
 * pantalla emparejara por su lado, la misma factura podría estar «sin cuenta» acá y «coincide» allá.
 *
 * ⚠ Nunca tumba el reporte: si el Excel no se puede leer, la cobranza de Nexus se muestra igual y la
 * pantalla dice que la comparación falló.
 *
 * ⚠ Sin `server-only`, igual que libro-alex-server.ts: lo usan también los scripts de medición.
 */
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import { compararLibro } from "@/lib/cobranza/libro-alex";
import { FUENTE_LIBRO_ALEX } from "@/lib/cobranza/libro-alex-lectura";
import { cargarContextoLibro, leerLoteDelLibro } from "@/lib/cobranza/libro-alex-server";
import { enLaCalleContraExcel, type ComparacionConExcel, type PorCobrarDeNexus } from "./cobranza-contra-excel";

/** Lo que el reporte ya sabe de cada cobro por cobrar. El nombre y el número los pone el contexto del libro. */
export type PorCobrarParaExcel = Pick<PorCobrarDeNexus, "cobroId" | "cuentaId" | "moneda" | "monto" | "fechaEmision">;

export async function cargarEnLaCalleContraExcel(
  porCobrar: readonly PorCobrarParaExcel[],
  hoyISO: string,
): Promise<ComparacionConExcel> {
  try {
    const ultimo = await prisma.importacionCobranza.findFirst({
      where: { fuente: FUENTE_LIBRO_ALEX, estado: { not: "DESCARTADO" } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!ultimo) return { estado: "SIN_EXCEL" };
    const [lote, { ctx }] = await Promise.all([leerLoteDelLibro(ultimo.id), cargarContextoLibro()]);
    if (!lote) return { estado: "SIN_EXCEL" };

    // El día de Costa Rica: el Excel de hoy se subió el 2026-09-14 a las 03:44 UTC, que acá era el 13.
    const subidoEl = crDateParts(new Date(lote.createdAt)).dateKey;
    if (!lote.filas.some((f) => f.seccion === "COMPENDIO")) {
      return { estado: "SIN_RESUMEN", subidoEl, archivo: lote.archivoNombre };
    }

    const nombrePorCuenta = new Map(ctx.cuentas.map((c) => [c.cuentaId, c.nombre]));
    const numeroPorCobro = new Map(ctx.cobros.map((c) => [c.id, c.numeroFactura]));
    return {
      estado: "OK",
      subidoEl,
      archivo: lote.archivoNombre,
      filasIlegibles: lote.filasIlegibles,
      porMoneda: enLaCalleContraExcel({
        filas: lote.filas,
        documentos: compararLibro(lote.filas, ctx).filas,
        porCobrar: porCobrar.map((c) => ({
          ...c,
          cliente: nombrePorCuenta.get(c.cuentaId) ?? "Cuenta sin nombre",
          numeroFactura: numeroPorCobro.get(c.cobroId) ?? null,
        })),
        hoyISO,
      }),
    };
  } catch (e) {
    console.error("[equilibrio] no se pudo comparar la cobranza con el Excel de Alex", e);
    return { estado: "ERROR", mensaje: "No se pudo leer el último Excel de Alex." };
  }
}
