/**
 * lib/cobranza/borrar-servicio.ts — cuándo se puede eliminar un servicio de Cobranza (feedback #18, 2026-10-30).
 *
 * Borrar un servicio se lleva sus cobros en cascada y no se deshace. Sirve para el que quedó finalizado sin cobros o
 * el que nunca funcionó (Honda tenía dos así). Por eso se elimina solo lo que ya es pasado y no dejó nada:
 *   · tiene que estar Finalizado: un contrato vivo no se borra de un clic (pasarlo a Finalizado es el paso consciente).
 *   · un cobro COBRADO es plata que entró: el servicio queda en el historial.
 *   · una factura emitida o emparejada con Odoo vive en otro sistema, y borrar el cobro la deja suelta.
 *   · la venta con comisión o atribución: se llevaría lo que Finanzas le debe a alguien.
 *
 * ⚠ Revertir una factura limpia el cobro sin anotar qué hay que anular en el ERP (eso lo hace `liberarYRegenerar`),
 * así que el mensaje NO sugiere revertir para poder borrar.
 *
 * La misma regla en el botón y en el servidor; lo que la pantalla no recibe (`ligadoAlErp`, `conComision`) solo lo mira
 * el servidor. PURO: sin Prisma ni red.
 */

export interface CobroParaBorrar {
  estado: string;
  fechaEmision: Date | string | null;
  numeroFactura: string | null;
}

export interface ServicioParaBorrar {
  estado: string;
  cobros: ReadonlyArray<CobroParaBorrar>;
  /** Algún cobro está emparejado con Odoo o lo ordenó el sistema. Solo lo sabe el servidor. */
  ligadoAlErp?: boolean;
  /** La venta tiene atribución o regla de comisión. Solo lo sabe el servidor. */
  conComision?: boolean;
}

/** Por qué NO se puede eliminar el servicio, o null si se puede. */
export function porQueNoSeBorraElServicio(s: ServicioParaBorrar): string | null {
  if (s.estado !== "FINALIZADO") return "No se puede eliminar: primero márcalo Finalizado.";
  const cobrados = s.cobros.filter((c) => c.estado === "COBRADO").length;
  if (cobrados > 0) {
    return `No se puede eliminar: tiene ${cobrados} ${cobrados === 1 ? "cobro ya cobrado" : "cobros ya cobrados"} y queda en el historial.`;
  }
  const facturados = s.cobros.filter((c) => c.fechaEmision !== null || c.numeroFactura !== null).length;
  if (facturados > 0 || s.ligadoAlErp) {
    return "No se puede eliminar: tiene una factura en Odoo o Mercury y quedaría suelta.";
  }
  if (s.conComision) return "No se puede eliminar: la venta está ligada a Comisiones.";
  return null;
}
