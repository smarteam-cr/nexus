"use client";

/**
 * components/cobranza/CronogramaCobros.tsx
 *
 * Cronograma de cobros de un servicio: cuota, período, fecha, monto, semáforo,
 * badge de catch-up y select de estado. Cambios optimistas con revert en error
 * (patrón AlertsFeed). Marcar COBRADO pide confirmación — se registra a nombre
 * de quien confirma (INV3: autonomía en la derivación, confirmación en el dinero).
 *
 * NOTA: `semaforoCobro` se importa de lib/cobranza/engine (motor puro, sin
 * Prisma) y NO del barrel lib/cobranza, que re-exporta módulos `server-only`.
 */
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { semaforoCobro } from "@/lib/cobranza/engine";
import type { CobroDTO } from "@/lib/cobranza";
import { COBRANZA_ESTADOS_COBRO, ESTADO_COBRO_LABEL } from "@/lib/cobranza/schema";
import { fmtFecha, fmtMonto, SEMAFORO_META } from "./format";

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

  // Re-sincronizar cuando el padre recarga el detalle (patrón oficial de
  // "adjusting state when props change" — setState durante render, sin effect).
  const [prevCobros, setPrevCobros] = useState(cobros);
  if (cobros !== prevCobros) {
    setPrevCobros(cobros);
    setItems(cobros);
  }

  async function applyEstado(cobro: CobroDTO, estado: string) {
    const prevEstado = items.find((c) => c.id === cobro.id)?.estado;
    setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, estado } : c)));
    try {
      await fetchJson(`/api/cobranza/cobros/${cobro.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
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
                <select
                  value={c.estado}
                  onChange={(e) => {
                    const estado = e.target.value;
                    if (estado === c.estado) return;
                    if (estado === "COBRADO") setConfirmCobro(c);
                    else applyEstado(c, estado);
                  }}
                  className="ml-auto text-[11px] border border-line rounded-md px-1.5 py-1 bg-surface text-fg focus:outline-none focus:border-brand flex-shrink-0"
                >
                  {COBRANZA_ESTADOS_COBRO.map((e) => (
                    <option key={e} value={e}>{ESTADO_COBRO_LABEL[e] ?? e}</option>
                  ))}
                </select>
              </div>
              {c.estado === "COBRADO" && c.confirmadoPor && (
                <p className="mt-1 text-[10px] text-emerald-600">✓ Confirmado por {c.confirmadoPor}</p>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={!!confirmCobro}
        z="z-[60]"
        variant="default"
        title="¿Confirmás que este cobro ya entró?"
        description={
          confirmCobro
            ? `${fmtMonto(confirmCobro.monto, confirmCobro.moneda)} · programado ${fmtFecha(confirmCobro.fechaProgramada)}. Se registrará a tu nombre.`
            : undefined
        }
        confirmLabel="Sí, ya entró"
        onCancel={() => setConfirmCobro(null)}
        onConfirm={async () => {
          const cobro = confirmCobro;
          setConfirmCobro(null);
          if (cobro) await applyEstado(cobro, "COBRADO");
        }}
      />
    </>
  );
}
