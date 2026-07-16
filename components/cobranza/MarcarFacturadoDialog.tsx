"use client";

/**
 * components/cobranza/MarcarFacturadoDialog.tsx — diálogo de "Marcar facturado" (Reloj 1).
 * Clon directo de RegistrarPagoDialog: presentacional, entrega { fechaEmision } y el caller
 * hace el PATCH + el optimista. Todo fechaEmision null→no-null termina en cambiarEstadoCobro,
 * que exige byEmail y setea facturadoPor/facturadoEn — mismo patrón que confirmadoPor (INV3).
 *
 * Fecha default hoy, capada a hoy — no se factura "a futuro" desde acá.
 */
import { useState } from "react";
import { fmtFecha, fmtMonto, INPUT_CLS } from "./format";

/** Shape mínimo del cobro a facturar — CobroDTO y ColaCobroRow lo satisfacen. */
export interface CobroFacturarRef {
  id: string;
  monto: number;
  moneda: string;
  fechaProgramada: string;
  numCuota?: number | null;
  periodo?: string;
  clienteNombre?: string;
}

export default function MarcarFacturadoDialog({
  cobro,
  todayISO,
  onCancel,
  onConfirm,
}: {
  cobro: CobroFacturarRef;
  todayISO: string;
  onCancel: () => void;
  onConfirm: (data: { fechaEmision: string }) => void;
}) {
  const [fecha, setFecha] = useState(todayISO);
  const fechaValida = !!fecha && fecha <= todayISO;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onMouseDown={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-xl border border-line bg-surface shadow-2xl p-4 space-y-3"
      >
        <h3 className="text-sm font-semibold text-fg">Marcar facturado</h3>
        <p className="text-xs text-fg-secondary">
          {cobro.clienteNombre ? `${cobro.clienteNombre} · ` : ""}
          {fmtMonto(cobro.monto, cobro.moneda)}
          {cobro.numCuota != null ? ` · cuota #${cobro.numCuota}` : ""} · programado{" "}
          {fmtFecha(cobro.fechaProgramada)}.
        </p>
        <div>
          <label className="block text-[11px] font-medium text-fg-muted mb-1">
            ¿Cuándo se emitió la factura?
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
        <div className="flex items-center justify-end gap-2 pt-1">
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
            onClick={() => onConfirm({ fechaEmision: fecha })}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Marcar facturado
          </button>
        </div>
      </div>
    </div>
  );
}
