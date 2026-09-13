/**
 * lib/cobranza/__fixtures__/libro-alex.ts
 *
 * Armadores de las pruebas del libro de Alex (libro-alex.test.ts y odoo/numero-propuesta.test.ts). Viven
 * acá y no en un test: importar un `.test.ts` desde otro vuelve a correr todas sus pruebas.
 */
import type { FilaLibro } from "../libro-alex-lectura";
import type { CobroParaLibro, FacturaParaLibro } from "../libro-alex";

type BaseDeFila = Pick<FilaLibro, "hoja" | "fila" | "seccion" | "cliente">;

export function filaDelLibro(f: BaseDeFila & Partial<FilaLibro>): FilaLibro {
  return {
    numero: null,
    proyecto: null,
    fechaFactura: null,
    fechaVencimiento: null,
    fechaPago: null,
    total: null,
    pendiente: null,
    moneda: "USD",
    estado: null,
    periodo: null,
    color: "SIN_COLOR",
    anotacion: null,
    origen: null,
    ...f,
  };
}

export function cobroDeNexus(c: Pick<CobroParaLibro, "id" | "cuentaId" | "periodo" | "monto"> & Partial<CobroParaLibro>): CobroParaLibro {
  return {
    servicioId: `srv-${c.cuentaId}`,
    servicio: "Servicio",
    fechaProgramada: `${c.periodo}-15`,
    fechaEmision: null,
    moneda: "USD",
    estado: "PROGRAMADO",
    confirmadoPor: null,
    numeroFactura: null,
    sinNumeroFacturaMotivo: null,
    numCuota: null,
    promesaPago: null,
    ...c,
  };
}

export function facturaDelEspejo(
  f: Pick<FacturaParaLibro, "numero" | "odooPartnerId" | "montoNeto" | "invoiceDate"> & Partial<FacturaParaLibro>,
): FacturaParaLibro {
  return {
    odooMoveId: Number(f.numero.replace(/\D/g, "")),
    odooPartnerNombre: "CLIENTE",
    moneda: "USD",
    montoImpuesto: Math.round(f.montoNeto * 13) / 100,
    moveType: "out_invoice",
    state: "posted",
    paymentState: "not_paid",
    ...f,
  };
}
