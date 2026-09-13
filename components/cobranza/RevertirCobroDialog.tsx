"use client";

/**
 * components/cobranza/RevertirCobroDialog.tsx — sacar un cobro de COBRADO.
 *
 * Antes era elegir otra opción en el `<select>` del cronograma: sin confirmación, sin motivo y
 * sin rastro de quién había dado la plata por entrada. Ahora pide el motivo, la fecha real en
 * que se emitió la factura y, si se tiene, su número. La regla vive en
 * lib/cobranza/reversion-cobro.ts y la aplica el chokepoint `cambiarEstadoCobroTx`; este
 * diálogo es presentacional: entrega los datos y el caller hace el PATCH.
 *
 * ⚠ La etiqueta del estado nuevo llega por prop y no se importa de lib/cobranza/schema.ts: ese
 * módulo trae zod, y este diálogo no tiene por qué sumarlo al bundle del navegador.
 *
 * ⚠ La fecha de emisión viene precargada con la que tiene el cobro, que en los importados es la
 * QUINCENA del libro y no la de la factura. Por eso se pide mirarla, no se da por buena.
 */
import { useState } from "react";
import { Alert, Modal } from "@/components/ui";
import { esFirmaDeImportacion, MOTIVO_REVERSION_MIN } from "@/lib/cobranza/reversion-cobro";
import { MOTIVO_SIN_NUMERO_MAX, MOTIVO_SIN_NUMERO_MIN, NUMERO_FACTURA_MAX } from "@/lib/cobranza/numero-factura";
import { fmtFecha, fmtMonto, INPUT_CLS } from "./format";

/** Shape mínimo del cobro a revertir — CobroDTO lo satisface. */
export interface CobroRevertirRef {
  id: string;
  monto: number;
  moneda: string;
  fechaProgramada: string;
  numCuota?: number | null;
  fechaEmision: string | null;
  fechaCobro: string | null;
  confirmadoPor: string | null;
  confirmadoEn: string | null;
  facturadoPor: string | null;
  numeroFactura?: string | null;
}

export interface DatosDeReversion {
  motivo: string;
  fechaEmision: string | null;
  /** Va a la columna del cobro, firmado (etapa 7). null = no toca el que tenga. */
  numeroFactura: string | null;
  /** Solo cuando la reversión le pone fecha a un cobro que no la tenía y no hay número. */
  sinNumeroFacturaMotivo: string | null;
}

export default function RevertirCobroDialog({
  cobro,
  estadoNuevo,
  etiquetaNueva,
  todayISO,
  onCancel,
  onConfirm,
}: {
  cobro: CobroRevertirRef;
  /** El estado que se eligió en el cronograma. Nunca COBRADO. */
  estadoNuevo: string;
  /** Cómo se llama ese estado en pantalla («Por cobrar»). */
  etiquetaNueva: string;
  todayISO: string;
  onCancel: () => void;
  onConfirm: (data: DatosDeReversion) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(cobro.fechaEmision ?? "");
  const [numero, setNumero] = useState(cobro.numeroFactura ?? "");
  const [sinNumero, setSinNumero] = useState(false);
  const [motivoSinNumero, setMotivoSinNumero] = useState("");

  const exigeFecha = estadoNuevo === "POR_COBRAR";
  const motivoValido = motivo.trim().length >= MOTIVO_REVERSION_MIN;
  const fechaValida = fecha ? fecha <= todayISO : !exigeFecha;
  /* Ponerle fecha a un cobro que no la tenía es marcar facturado, y eso pide el número o decir por
     qué no está (lib/cobranza/numero-factura.ts). Sin esto el servidor lo rechazaba con un 400. */
  const exigeNumero = !cobro.fechaEmision && !!fecha;
  const numeroValido =
    !exigeNumero || (sinNumero ? motivoSinNumero.trim().length >= MOTIVO_SIN_NUMERO_MIN : !!numero.trim());
  const confirmadoPorImportacion = esFirmaDeImportacion(cobro.confirmadoPor);
  const refirmaFacturado = !!fecha && !!cobro.fechaEmision && esFirmaDeImportacion(cobro.facturadoPor);

  const descripcion =
    fmtMonto(cobro.monto, cobro.moneda) +
    (cobro.numCuota != null ? ` · cuota #${cobro.numCuota}` : "") +
    ` · programado ${fmtFecha(cobro.fechaProgramada)}. Pasa de Cobrado a ${etiquetaNueva} y queda en la bitácora a tu nombre.`;

  return (
    <Modal
      open
      onClose={onCancel}
      size="sm"
      z="z-[70]"
      title="Sacar de Cobrado"
      description={descripcion}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-fg-muted hover:text-fg px-2 py-1.5"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!motivoValido || !fechaValida || !numeroValido}
            onClick={() =>
              onConfirm({
                motivo: motivo.trim(),
                fechaEmision: fecha || null,
                /* Sin fecha no hay factura, y un número sin factura es un 400: no se manda. */
                numeroFactura: fecha && !(exigeNumero && sinNumero) ? numero.trim() || null : null,
                sinNumeroFacturaMotivo: exigeNumero && sinNumero ? motivoSinNumero.trim() : null,
              })
            }
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-danger-line text-danger-ink bg-danger-surface hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Pasar a {etiquetaNueva}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Alert variant={confirmadoPorImportacion ? "warning" : "info"}>
          <p className="text-xs">
            Lo confirmó <span className="font-medium">{cobro.confirmadoPor ?? "nadie"}</span>
            {cobro.confirmadoEn ? ` el ${fmtFecha(cobro.confirmadoEn)}` : ""}
            {cobro.fechaCobro ? `, con el pago fechado el ${fmtFecha(cobro.fechaCobro)}` : ""}.
            {confirmadoPorImportacion &&
              " Esa firma es de la importación del libro: el verde salió del color de una celda, no de un depósito."}
          </p>
        </Alert>

        <div>
          <label className="block text-[11px] font-medium text-fg-muted mb-1">
            ¿Por qué sale de Cobrado?
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Ej.: el depósito nunca entró; el libro lo marcaba pagado por error"
            className={INPUT_CLS}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-fg-muted mb-1">
            ¿Cuándo se emitió la factura?{exigeFecha ? "" : " (opcional)"}
          </label>
          <input
            type="date"
            value={fecha}
            max={todayISO}
            onChange={(e) => setFecha(e.target.value)}
            className={INPUT_CLS}
          />
          <p className="mt-1 text-[10px] text-fg-muted">
            La fecha que dice la factura, no la quincena del plan.
            {refirmaFacturado && " La marca de facturado pasa a tu nombre; la firma de la importación queda en la bitácora."}
          </p>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-fg-muted mb-1">
            Número de factura{exigeNumero ? "" : " (opcional)"}
          </label>
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="FAC/2026/0206"
            maxLength={NUMERO_FACTURA_MAX}
            disabled={!fecha || (exigeNumero && sinNumero)}
            className={`${INPUT_CLS} disabled:opacity-50`}
          />
          <p className="mt-1 text-[10px] text-fg-muted">
            {fecha
              ? "Queda en el cobro a tu nombre, y en la bitácora."
              : "Sin fecha de emisión no hay factura, y sin factura no hay número."}
          </p>
          {exigeNumero && (
            <label className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-secondary">
              <input type="checkbox" checked={sinNumero} onChange={(e) => setSinNumero(e.target.checked)} />
              No tengo el número
            </label>
          )}
          {exigeNumero && sinNumero && (
            <textarea
              value={motivoSinNumero}
              onChange={(e) => setMotivoSinNumero(e.target.value)}
              rows={2}
              maxLength={MOTIVO_SIN_NUMERO_MAX}
              placeholder="¿Por qué no lo tenés? Ej.: QuickBooks no numera las facturas en el libro"
              className={`${INPUT_CLS} mt-1.5`}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
