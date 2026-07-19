"use client";

/**
 * components/cobranza/BuscarPagoModal.tsx — el buscador del botón global
 * "Registrar pago": autocomplete 100% client-side sobre la cola YA cargada
 * (cero endpoints nuevos). Elegir un cobro cierra este modal y el contenedor
 * abre el RegistrarPagoDialog. Cascarón = primitiva Modal (z-[70]: puede abrirse
 * sobre el CuentaDrawer, que vive en z-[60]).
 */
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui";
import type { ColaCobroRow } from "@/lib/cobranza";
import { TIPO_SERVICIO_LABEL } from "@/lib/cobranza/schema";
import { fmtFecha, fmtMonto, INPUT_CLS } from "./format";

const CAP = 30;

export default function BuscarPagoModal({
  rows,
  onSelect,
  onManual,
  onClose,
}: {
  rows: ColaCobroRow[];
  onSelect: (row: ColaCobroRow) => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows;
    if (needle) {
      list = rows.filter(
        (r) =>
          r.clienteNombre.toLowerCase().includes(needle) ||
          (TIPO_SERVICIO_LABEL[r.servicioTipo] ?? r.servicioTipo).toLowerCase().includes(needle) ||
          r.periodo.includes(needle),
      );
    }
    // Lo más atrasado primero: es lo que más probablemente se vino a registrar.
    return [...list].sort((a, b) => b.diasAtraso - a.diasAtraso || a.id.localeCompare(b.id));
  }, [rows, q]);

  const visibles = matches.slice(0, CAP);
  const deMas = matches.length - visibles.length;

  return (
    <Modal open onClose={onClose} size="lg" z="z-[70]">
      <div
        className="space-y-2"
        onKeyDown={(e) => {
          // Escape lo maneja la primitiva (closeOnEscape).
          if (e.key === "Enter" && visibles[0]) onSelect(visibles[0]);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscá el cliente o el período…"
          className={INPUT_CLS}
          autoFocus
        />
        {rows.length === 0 ? (
          <p className="text-xs text-fg-muted px-1 py-3 text-center">
            No hay cobros pendientes de registrar.
          </p>
        ) : visibles.length === 0 ? (
          <p className="text-xs text-fg-muted px-1 py-3 text-center">Nada matchea esa búsqueda.</p>
        ) : (
          <ul className="max-h-[50vh] overflow-y-auto divide-y divide-line">
            {visibles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r)}
                  className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-surface-hover transition-colors rounded-md"
                >
                  <span className="text-xs font-medium text-fg flex-shrink-0">{r.clienteNombre}</span>
                  <span className="text-[11px] text-fg-muted truncate">
                    {TIPO_SERVICIO_LABEL[r.servicioTipo] ?? r.servicioTipo}
                    {r.numCuota != null ? ` · #${r.numCuota}` : ""} · {r.periodo}
                  </span>
                  {r.diasAtraso > 0 ? (
                    <span className="text-[11px] text-red-600 font-semibold flex-shrink-0">
                      hace {r.diasAtraso} d
                    </span>
                  ) : (
                    <span className="text-[11px] text-fg-secondary flex-shrink-0">
                      {fmtFecha(r.fechaProgramada)}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-fg tabular-nums flex-shrink-0">
                    {fmtMonto(r.monto, r.moneda)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {deMas > 0 && (
          <p className="text-[11px] text-fg-muted px-1">y {deMas} más — afiná la búsqueda.</p>
        )}
        <div className="border-t border-line pt-2">
          <button
            type="button"
            onClick={onManual}
            className="w-full text-left px-2 py-1.5 text-xs font-medium text-brand hover:bg-surface-hover rounded-md transition-colors"
          >
            Registrar un pago que no está en la lista
          </button>
        </div>
      </div>
    </Modal>
  );
}
