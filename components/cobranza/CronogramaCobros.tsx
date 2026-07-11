"use client";

/**
 * components/cobranza/CronogramaCobros.tsx
 *
 * Cronograma de cobros de un servicio: cuota, período, fecha, monto, semáforo,
 * badge de catch-up y select de estado. Cambios optimistas con revert en error
 * (patrón AlertsFeed). Marcar COBRADO pide confirmación — se registra a nombre
 * de quien confirma (INV3: autonomía en la derivación, confirmación en el dinero)
 * y acepta una referencia externa OPCIONAL (id de transacción Mercury / factura
 * Odoo — ReconciliationPort v1: trazabilidad sin volver a Nexus contabilidad).
 *
 * NOTA: `semaforoCobro` se importa de lib/cobranza/engine (motor puro, sin
 * Prisma) y NO del barrel lib/cobranza, que re-exporta módulos `server-only`.
 */
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { semaforoCobro } from "@/lib/cobranza/engine";
import type { CobroDTO } from "@/lib/cobranza";
import { COBRANZA_ESTADOS_COBRO, ESTADO_COBRO_LABEL } from "@/lib/cobranza/schema";
import { fmtFecha, fmtMonto, SEMAFORO_META, INPUT_CLS } from "./format";
import BorradorCobroModal from "./BorradorCobroModal";

export default function CronogramaCobros({
  cobros,
  todayISO,
  onRefresh,
}: {
  cobros: CobroDTO[];
  todayISO: string;
  /** Recarga el detalle (tras COBRADO trae confirmadoPor fresco). */
  onRefresh: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState(cobros);
  const [confirmCobro, setConfirmCobro] = useState<CobroDTO | null>(null);
  const [borradorCobro, setBorradorCobro] = useState<CobroDTO | null>(null);
  const [promesaCobro, setPromesaCobro] = useState<CobroDTO | null>(null);

  // Re-sincronizar cuando el padre recarga el detalle (patrón oficial de
  // "adjusting state when props change" — setState durante render, sin effect).
  const [prevCobros, setPrevCobros] = useState(cobros);
  if (cobros !== prevCobros) {
    setPrevCobros(cobros);
    setItems(cobros);
  }

  async function applyEstado(
    cobro: CobroDTO,
    estado: string,
    extra?: { referenciaExterna?: string | null },
  ) {
    const prevEstado = items.find((c) => c.id === cobro.id)?.estado;
    setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, estado } : c)));
    try {
      await fetchJson(`/api/cobranza/cobros/${cobro.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado, ...(extra ?? {}) }),
      });
      if (estado === "COBRADO") {
        toast.success("Cobro confirmado a tu nombre.");
        onRefresh(); // trae confirmadoPor/confirmadoEn frescos
      }
    } catch (e) {
      if (prevEstado) {
        setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, estado: prevEstado } : c)));
      }
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar el cobro.");
    }
  }

  async function applyPromesa(cobro: CobroDTO, promesaPago: string | null) {
    const prev = items.find((c) => c.id === cobro.id)?.promesaPago ?? null;
    setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, promesaPago } : c)));
    try {
      await fetchJson(`/api/cobranza/cobros/${cobro.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promesaPago }),
      });
      toast.success(
        promesaPago
          ? "Promesa registrada — sus alertas se callan hasta esa fecha."
          : "Promesa retirada — sus alertas vuelven al feed.",
      );
    } catch (e) {
      setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, promesaPago: prev } : c)));
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la promesa.");
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-fg-muted rounded-lg border border-dashed border-line px-3 py-3 text-center">
        Sin cobros generados todavía — guardá el plan y apretá &quot;Generar cobros&quot;.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-1.5">
        {items.map((c) => {
          const sem = SEMAFORO_META[semaforoCobro({ estado: c.estado, fechaProgramadaISO: c.fechaProgramada }, todayISO)];
          return (
            <li key={c.id} className="rounded-lg border border-line bg-surface px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-fg tabular-nums flex-shrink-0">
                  {c.numCuota != null ? `#${c.numCuota}` : "—"}
                </span>
                <span className="text-[11px] text-fg-muted flex-shrink-0">{c.periodo}</span>
                <span className="text-[11px] text-fg-secondary flex-shrink-0">{fmtFecha(c.fechaProgramada)}</span>
                <span className="text-xs text-fg tabular-nums flex-shrink-0">{fmtMonto(c.monto, c.moneda)}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${sem.chip}`}>
                  {sem.label}
                </span>
                {c.origen === "CATCH_UP" && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-amber-600 bg-amber-500/10 border-amber-500/30 flex-shrink-0">
                    catch-up
                  </span>
                )}
                {c.estado !== "COBRADO" && c.promesaPago && (
                  <span
                    title={
                      c.promesaPago >= todayISO
                        ? "Promesa vigente: sus alertas están calladas hasta esa fecha"
                        : "Promesa incumplida: la fecha pasó sin cobro"
                    }
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${
                      c.promesaPago >= todayISO
                        ? "text-sky-600 bg-sky-500/10 border-sky-500/30"
                        : "text-red-600 bg-red-500/10 border-red-500/30"
                    }`}
                  >
                    prometió {fmtFecha(c.promesaPago)}
                  </span>
                )}
                {c.estado !== "COBRADO" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPromesaCobro(c)}
                      title="Registrar la fecha en que el cliente prometió pagar (calla sus alertas hasta entonces)"
                      className="ml-auto text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors flex-shrink-0"
                    >
                      🤝 Prometió
                    </button>
                    <button
                      type="button"
                      onClick={() => setBorradorCobro(c)}
                      title="Generar borrador de correo de cobro (lo revisás y lo enviás vos)"
                      className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors flex-shrink-0"
                    >
                      ✉ Borrador
                    </button>
                  </>
                )}
                <select
                  value={c.estado}
                  onChange={(e) => {
                    const estado = e.target.value;
                    if (estado === c.estado) return;
                    if (estado === "COBRADO") setConfirmCobro(c);
                    else applyEstado(c, estado);
                  }}
                  className={`${c.estado === "COBRADO" ? "ml-auto " : ""}text-[11px] border border-line rounded-md px-1.5 py-1 bg-surface text-fg focus:outline-none focus:border-brand flex-shrink-0`}
                >
                  {COBRANZA_ESTADOS_COBRO.map((e) => (
                    <option key={e} value={e}>{ESTADO_COBRO_LABEL[e] ?? e}</option>
                  ))}
                </select>
              </div>
              {c.estado === "COBRADO" && c.confirmadoPor && (
                <p className="mt-1 text-[10px] text-emerald-600">
                  ✓ Confirmado por {c.confirmadoPor}
                  {c.referenciaExterna && (
                    <span className="text-fg-muted"> · ref. {c.referenciaExterna}</span>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {confirmCobro && (
        <ConfirmCobradoDialog
          cobro={confirmCobro}
          onCancel={() => setConfirmCobro(null)}
          onConfirm={async (referenciaExterna) => {
            const cobro = confirmCobro;
            setConfirmCobro(null);
            await applyEstado(cobro, "COBRADO", { referenciaExterna });
          }}
        />
      )}

      {borradorCobro && (
        <BorradorCobroModal cobro={borradorCobro} onClose={() => setBorradorCobro(null)} />
      )}

      {promesaCobro && (
        <PromesaDialog
          cobro={promesaCobro}
          onCancel={() => setPromesaCobro(null)}
          onSave={async (promesaPago) => {
            const cobro = promesaCobro;
            setPromesaCobro(null);
            await applyPromesa(cobro, promesaPago);
          }}
        />
      )}
    </>
  );
}

/**
 * Diálogo LOCAL de promesa de pago (clon estructural de ConfirmCobradoDialog):
 * fecha prometida + quitar promesa. La promesa solo calla alertas — semáforos y
 * métricas NO cambian; si la fecha pasa sin cobro, el corte emite PROMESA_INCUMPLIDA.
 */
function PromesaDialog({
  cobro,
  onCancel,
  onSave,
}: {
  cobro: CobroDTO;
  onCancel: () => void;
  onSave: (promesaPago: string | null) => void;
}) {
  const [fecha, setFecha] = useState(cobro.promesaPago ?? "");
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onMouseDown={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-xl border border-line bg-surface shadow-2xl p-4 space-y-3"
      >
        <h3 className="text-sm font-semibold text-fg">¿Para cuándo prometió pagar?</h3>
        <p className="text-xs text-fg-secondary">
          {fmtMonto(cobro.monto, cobro.moneda)} · programado {fmtFecha(cobro.fechaProgramada)}. Sus
          alertas se callan hasta la fecha prometida; el semáforo no cambia.
        </p>
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
    </div>
  );
}

/**
 * Diálogo LOCAL de confirmación de COBRADO (no se toca el ConfirmDialog compartido):
 * mismo copy + input opcional de referencia externa (ReconciliationPort manual).
 */
function ConfirmCobradoDialog({
  cobro,
  onCancel,
  onConfirm,
}: {
  cobro: CobroDTO;
  onCancel: () => void;
  onConfirm: (referenciaExterna: string | null) => void;
}) {
  const [referencia, setReferencia] = useState("");
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onMouseDown={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-xl border border-line bg-surface shadow-2xl p-4 space-y-3"
      >
        <h3 className="text-sm font-semibold text-fg">¿Confirmás que este cobro ya entró?</h3>
        <p className="text-xs text-fg-secondary">
          {fmtMonto(cobro.monto, cobro.moneda)} · programado {fmtFecha(cobro.fechaProgramada)}. Se
          registrará a tu nombre.
        </p>
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
            onClick={() => onConfirm(referencia.trim() || null)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors"
          >
            Sí, ya entró
          </button>
        </div>
      </div>
    </div>
  );
}
