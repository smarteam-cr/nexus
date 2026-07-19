"use client";

/**
 * components/cobranza/PromesaDialog.tsx — diálogo de promesa de pago, compartido
 * por la cola de cobros y el cronograma del drawer. La promesa solo calla alertas
 * — semáforos y métricas NO cambian; si la fecha pasa sin cobro, el corte emite
 * PROMESA_INCUMPLIDA. Presentacional: entrega la fecha (o null) y el caller
 * hace el PATCH.
 */
import { useState } from "react";
import { Modal } from "@/components/ui";
import { fmtFecha, fmtMonto, INPUT_CLS } from "./format";

/** Shape mínimo — CobroDTO y ColaCobroRow lo satisfacen. */
export interface CobroPromesaRef {
  id: string;
  monto: number;
  moneda: string;
  fechaProgramada: string;
  promesaPago: string | null;
}

export default function PromesaDialog({
  cobro,
  onCancel,
  onSave,
}: {
  cobro: CobroPromesaRef;
  onCancel: () => void;
  onSave: (promesaPago: string | null) => void;
}) {
  const [fecha, setFecha] = useState(cobro.promesaPago ?? "");
  return (
    <Modal
      open={true}
      onClose={onCancel}
      size="sm"
      // Se abre ENCIMA del CuentaDrawer (z-[60]) desde el cronograma del drawer.
      z="z-[70]"
      title="¿Para cuándo prometió pagar?"
      description={`${fmtMonto(cobro.monto, cobro.moneda)} · programado ${fmtFecha(cobro.fechaProgramada)}. Sus alertas se callan hasta la fecha prometida; el semáforo no cambia.`}
    >
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-medium text-fg-muted mb-1">Fecha prometida</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={INPUT_CLS}
            autoFocus
          />
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          {cobro.promesaPago ? (
            <button
              type="button"
              onClick={() => onSave(null)}
              className="text-xs text-red-600 hover:underline px-1 py-1.5"
            >
              Quitar promesa
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-fg-muted hover:text-fg px-2 py-1.5"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!fecha}
              onClick={() => onSave(fecha)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Guardar promesa
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
