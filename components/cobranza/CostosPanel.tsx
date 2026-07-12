"use client";

/**
 * components/cobranza/CostosPanel.tsx — costos recurrentes de REFERENCIA
 * (fase 4, solo SUPER_ADMIN): salarios all-in estimados, herramientas y fijos
 * de operación, para el burn mensual de dirección. Cifras estimadas — NO es
 * contabilidad ni tracking de pagos (un costo no vence, no hay semáforo).
 * CRC y USD SIEMPRE separados (jamás se suman). Sin update optimista: tras
 * POST/PATCH/DELETE ok se llama onChanged() y el contenedor re-fetchea.
 */
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { CostoRecurrenteDTO } from "@/lib/cobranza";
import {
  COSTOS_CATEGORIAS,
  CATEGORIA_COSTO_LABEL,
  FRECUENCIA_COSTO_LABEL,
} from "@/lib/cobranza/schema";
import { fmtMonto } from "./format";
import CostoForm from "./CostoForm";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monto mensualizado de un costo (ANUAL → monto/12). */
const mensualizado = (c: CostoRecurrenteDTO) => (c.frecuencia === "ANUAL" ? c.monto / 12 : c.monto);

export default function CostosPanel({
  costos,
  onChanged,
}: {
  costos: CostoRecurrenteDTO[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<{ abierto: boolean; costo: CostoRecurrenteDTO | null }>({
    abierto: false,
    costo: null,
  });
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  // Burn mensual estimado POR MONEDA (jamás sumadas): solo activos, ANUAL ÷ 12.
  const burn = useMemo(() => {
    const tot = { CRC: 0, USD: 0 };
    for (const c of costos) {
      if (!c.activo) continue;
      if (c.moneda === "USD") tot.USD += mensualizado(c);
      else tot.CRC += mensualizado(c);
    }
    return { CRC: round2(tot.CRC), USD: round2(tot.USD) };
  }, [costos]);

  // Agrupado por categoría en el orden canónico (SALARIO, HERRAMIENTA, FIJO_OPERACION).
  const grupos = useMemo(
    () =>
      COSTOS_CATEGORIAS.map((cat) => ({
        cat,
        items: costos.filter((c) => c.categoria === cat),
      })).filter((g) => g.items.length > 0),
    [costos],
  );

  async function borrar(id: string) {
    if (borrandoId) return;
    setBorrandoId(id);
    try {
      await fetchJson(`/api/cobranza/costos/${id}`, { method: "DELETE" });
      toast.success("Costo borrado.");
      setConfirmandoId(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar el costo.");
    } finally {
      setBorrandoId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Naturaleza de los datos (banner ámbar) ── */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
        Cifras estimadas — referencia para dirección, no contabilidad.
      </div>

      {/* ── Encabezado + CTA ── */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-fg-muted">
          Costos de referencia: salarios all-in, herramientas y fijos de operación.
        </p>
        <button
          type="button"
          onClick={() => setForm({ abierto: true, costo: null })}
          className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors"
        >
          Agregar costo
        </button>
      </div>

      {costos.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Sin costos registrados"
          description="Todavía no registraste ningún costo. Empezá por los salarios y las herramientas fijas."
        />
      ) : (
        <>
          {/* ── Burn mensual estimado, POR MONEDA (jamás sumadas) ── */}
          <div className="grid grid-cols-2 gap-3">
            {(["CRC", "USD"] as const).map((m) => (
              <div key={m} className="rounded-xl border border-line bg-surface px-4 py-3">
                <p
                  className={`text-lg font-bold leading-tight tabular-nums text-fg ${
                    burn[m] === 0 ? "opacity-40" : ""
                  }`}
                >
                  {fmtMonto(burn[m], m)}
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wide mt-1 text-fg-muted">
                  Burn mensual estimado · {m}
                </p>
                <p className="text-[11px] mt-0.5 text-fg-muted opacity-70">
                  solo activos · anual ÷ 12
                </p>
              </div>
            ))}
          </div>

          {/* ── Lista agrupada por categoría ── */}
          {grupos.map(({ cat, items }) => (
            <div key={cat} className="rounded-xl border border-line bg-surface overflow-hidden">
              <div className="px-4 py-2.5 bg-surface-muted border-b border-line text-[11px] font-semibold text-fg-muted uppercase tracking-wide">
                {CATEGORIA_COSTO_LABEL[cat] ?? cat} · {items.length}
              </div>
              <ul className="divide-y divide-line">
                {items.map((c) => (
                  <li key={c.id} className="px-4 py-2.5">
                    <div className={`flex flex-wrap items-center gap-2 ${c.activo ? "" : "opacity-60"}`}>
                      <span className="flex-1 min-w-[160px] truncate text-sm font-medium text-fg">
                        {c.nombre}
                        {c.categoria === "SALARIO" && c.teamMemberName ? (
                          <span className="font-normal text-fg-muted"> · {c.teamMemberName}</span>
                        ) : null}
                      </span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-muted whitespace-nowrap">
                        {c.frecuencia === "ANUAL"
                          ? `Anual → ${fmtMonto(round2(c.monto / 12), c.moneda)}/mes`
                          : (FRECUENCIA_COSTO_LABEL[c.frecuencia] ?? c.frecuencia)}
                      </span>
                      {!c.activo && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-600 whitespace-nowrap">
                          Pausado
                        </span>
                      )}
                      <span className="w-32 text-right text-sm font-medium tabular-nums text-fg whitespace-nowrap">
                        {fmtMonto(c.monto, c.moneda)}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setForm({ abierto: true, costo: c })}
                          className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmandoId(confirmandoId === c.id ? null : c.id)}
                          className="text-[11px] font-medium px-2 py-1 rounded-md border border-red-500/30 text-red-600 hover:bg-red-500/10 transition-colors"
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                    {confirmandoId === c.id && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
                        <p className="flex-1 min-w-[200px] text-xs text-red-600">
                          ¿Borrar este costo? Esta acción no se puede deshacer. Si preferís
                          pausarlo, editalo y desactivalo.
                        </p>
                        <button
                          type="button"
                          onClick={() => setConfirmandoId(null)}
                          className="text-[11px] text-fg-muted hover:text-fg px-2 py-1"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={borrandoId === c.id}
                          onClick={() => void borrar(c.id)}
                          className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-red-500/30 text-red-600 bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          {borrandoId === c.id ? "Borrando…" : "Sí, borrar"}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}

      {form.abierto && (
        <CostoForm
          costo={form.costo}
          onClose={() => setForm({ abierto: false, costo: null })}
          onSaved={() => {
            setForm({ abierto: false, costo: null });
            onChanged();
          }}
        />
      )}
    </div>
  );
}
