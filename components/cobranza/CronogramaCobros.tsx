"use client";

/**
 * components/cobranza/CronogramaCobros.tsx
 *
 * Cronograma de cobros de un servicio (superficie de ADMINISTRACIÓN — la vía
 * rápida del día a día es la cola de cobros del landing): cuota, período, fecha,
 * monto, semáforo, badge de catch-up y select de estado. Cambios optimistas con
 * revert en error (patrón AlertsFeed). Marcar COBRADO abre el RegistrarPagoDialog
 * compartido — se registra a nombre de quien confirma (INV3) con fecha del pago
 * y referencia externa opcional.
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
import { fmtFecha, fmtMonto, SEMAFORO_META } from "./format";
import BorradorCobroModal from "./BorradorCobroModal";
import RegistrarPagoDialog from "./RegistrarPagoDialog";
import PromesaDialog from "./PromesaDialog";
import MarcarFacturadoDialog from "./MarcarFacturadoDialog";

export default function CronogramaCobros({
  cobros,
  todayISO,
  onRefresh,
  creditoDias,
}: {
  cobros: CobroDTO[];
  todayISO: string;
  /** Recarga el detalle (tras COBRADO trae confirmadoPor fresco). */
  onRefresh: () => void;
  /** Crédito resuelto de la cuenta (cuenta.creditoDias ?? DEFAULT_CREDITO_DIAS). */
  creditoDias: number;
}) {
  const toast = useToast();
  const [items, setItems] = useState(cobros);
  const [confirmCobro, setConfirmCobro] = useState<CobroDTO | null>(null);
  const [borradorCobro, setBorradorCobro] = useState<CobroDTO | null>(null);
  const [promesaCobro, setPromesaCobro] = useState<CobroDTO | null>(null);
  const [facturarCobro, setFacturarCobro] = useState<CobroDTO | null>(null);

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
    extra?: { referenciaExterna?: string | null; fechaCobro?: string },
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
        toast.success("Pago registrado a tu nombre.");
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

  // Marcar facturado / revertir: sin gate de estado (única superficie que ve COBRADO — es
  // donde se hace el backfill de facturación histórica).
  async function applyFacturar(cobro: CobroDTO, fechaEmision: string | null) {
    const prev = items.find((c) => c.id === cobro.id)?.fechaEmision ?? null;
    setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, fechaEmision } : c)));
    try {
      await fetchJson(`/api/cobranza/cobros/${cobro.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaEmision }),
      });
      toast.success(fechaEmision ? "Marcado como facturado." : "Factura revertida.");
      onRefresh(); // trae facturadoPor/facturadoEn frescos
    } catch (e) {
      setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, fechaEmision: prev } : c)));
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar la factura.");
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
          const sem = SEMAFORO_META[
            semaforoCobro(
              {
                estado: c.estado,
                fechaProgramadaISO: c.fechaProgramada,
                fechaEmisionISO: c.fechaEmision,
                promesaPagoISO: c.promesaPago,
              },
              todayISO,
              creditoDias,
            )
          ];
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
                {c.fechaEmision ? (
                  <button
                    type="button"
                    onClick={() => applyFacturar(c, null)}
                    title="Revertir la marca de facturado"
                    className="ml-auto text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors flex-shrink-0"
                  >
                    Revertir factura
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFacturarCobro(c)}
                    title="Marcar que ya se emitió la factura de este cobro"
                    className="ml-auto text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors flex-shrink-0"
                  >
                    Marcar facturado
                  </button>
                )}
                {c.estado !== "COBRADO" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPromesaCobro(c)}
                      title="Registrar la fecha en que el cliente prometió pagar (calla sus alertas hasta entonces)"
                      className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors flex-shrink-0"
                    >
                      Prometió
                    </button>
                    <button
                      type="button"
                      onClick={() => setBorradorCobro(c)}
                      title="Generar borrador de correo de cobro (lo revisás y lo enviás vos)"
                      className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors flex-shrink-0"
                    >
                      Borrador
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
                  className="text-[11px] border border-line rounded-md px-1.5 py-1 bg-surface text-fg focus:outline-none focus:border-brand flex-shrink-0"
                >
                  {COBRANZA_ESTADOS_COBRO.map((e) => (
                    <option key={e} value={e}>{ESTADO_COBRO_LABEL[e] ?? e}</option>
                  ))}
                </select>
              </div>
              {c.fechaEmision && c.facturadoPor && (
                <p className="mt-1 text-[10px] text-sky-600">
                  ✓ Facturado por {c.facturadoPor} · {fmtFecha(c.fechaEmision)}
                </p>
              )}
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
        <RegistrarPagoDialog
          cobro={confirmCobro}
          todayISO={todayISO}
          onCancel={() => setConfirmCobro(null)}
          onConfirm={async ({ fechaCobro, referenciaExterna }) => {
            const cobro = confirmCobro;
            setConfirmCobro(null);
            await applyEstado(cobro, "COBRADO", { fechaCobro, referenciaExterna });
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

      {facturarCobro && (
        <MarcarFacturadoDialog
          cobro={facturarCobro}
          todayISO={todayISO}
          onCancel={() => setFacturarCobro(null)}
          onConfirm={async ({ fechaEmision }) => {
            const cobro = facturarCobro;
            setFacturarCobro(null);
            await applyFacturar(cobro, fechaEmision);
          }}
        />
      )}
    </>
  );
}
