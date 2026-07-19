"use client";

/**
 * components/cobranza/RegistrarPagoDialog.tsx — EL diálogo de registrar un pago.
 * Compartido por la cola de cobros, el buscador global y el cronograma del drawer.
 * Presentacional a propósito: entrega { fechaCobro, referenciaExterna } y el caller
 * hace el PATCH + el optimista (el estado vive donde viven los datos). Todo COBRADO
 * termina en cambiarEstadoCobro vía PATCH — INV3 intacto.
 *
 * La fecha del pago (default hoy, capada a hoy) es la pieza clave para conciliar
 * en lote: la plata suele entrar días antes de que alguien la registre.
 */
import { useState } from "react";
import { Modal } from "@/components/ui";
import { fmtFecha, fmtMonto, INPUT_CLS } from "./format";

/** Shape mínimo del cobro a registrar — CobroDTO y ColaCobroRow lo satisfacen. */
export interface CobroPagoRef {
  id: string;
  monto: number;
  moneda: string;
  fechaProgramada: string;
  numCuota?: number | null;
  periodo?: string;
  clienteNombre?: string;
}

export default function RegistrarPagoDialog({
  cobro,
  todayISO,
  onCancel,
  onConfirm,
}: {
  cobro: CobroPagoRef;
  todayISO: string;
  onCancel: () => void;
  onConfirm: (data: { fechaCobro: string; referenciaExterna: string | null }) => void;
}) {
  const [fecha, setFecha] = useState(todayISO);
  const [referencia, setReferencia] = useState("");
  const fechaValida = !!fecha && fecha <= todayISO;

  const descripcion =
    `${cobro.clienteNombre ? `${cobro.clienteNombre} · ` : ""}` +
    `${fmtMonto(cobro.monto, cobro.moneda)}` +
    `${cobro.numCuota != null ? ` · cuota #${cobro.numCuota}` : ""}` +
    ` · programado ${fmtFecha(cobro.fechaProgramada)}. Se registra a tu nombre.`;

  return (
    <Modal
      open={true}
      onClose={onCancel}
      title="Registrar pago"
      description={descripcion}
      size="sm"
      z="z-[70]"
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
            disabled={!fechaValida}
            onClick={() => onConfirm({ fechaCobro: fecha, referenciaExterna: referencia.trim() || null })}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Registrar pago
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-medium text-fg-muted mb-1">
            ¿Cuándo entró el pago?
          </label>
          <input
            type="date"
            value={fecha}
            max={todayISO}
            onChange={(e) => setFecha(e.target.value)}
            className={INPUT_CLS}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-fg-muted mb-1">
            Referencia externa (opcional)
          </label>
          <input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Id de transacción Mercury / factura Odoo"
            maxLength={200}
            className={INPUT_CLS}
          />
        </div>
      </div>
    </Modal>
  );
}
