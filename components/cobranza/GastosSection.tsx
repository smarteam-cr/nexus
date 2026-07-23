"use client";

/**
 * components/cobranza/GastosSection.tsx — gastos puntuales (fase 4.5, SUPER_ADMIN).
 * Gastos únicos y circunstanciales (eventos, compras puntuales) como REFERENCIA
 * estimada — los FUTUROS ya entran a la caja neta (lado sale). Filtro por tag
 * (single) con total del filtro POR MONEDA SEPARADA + tabla de totales por mes.
 * Sin optimista: toda mutación llama onChanged() y el contenedor re-fetchea.
 * REGLA DURA: CRC y USD JAMÁS se suman ni se convierten.
 */
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { GastoPuntualDTO, TotalesMoneda } from "@/lib/cobranza";
import { fmtMontoVisible, fmtFecha } from "./format";
import GastoForm from "./GastoForm";

const TH_CLS =
  "px-4 py-2.5 text-left text-[11px] font-semibold text-fg-muted uppercase tracking-wide whitespace-nowrap";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-07" → "jul 2026". */
function fmtMes(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MESES[m - 1] ?? ym} ${y}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function GastosSection({
  gastos,
  todayISO,
  onChanged,
  mostrarDatos,
}: {
  gastos: GastoPuntualDTO[];
  todayISO: string;
  onChanged: () => void;
  /** Toggle "Mostrar datos" del panel padre — lo comparten las 3 sub-vistas. */
  mostrarDatos: boolean;
}) {
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<GastoPuntualDTO | null>(null);
  const [filtroTag, setFiltroTag] = useState<string | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  // Tags distintos con su conteo (sobre TODOS los gastos, no el filtrado), desc por conteo.
  const tagsConConteo = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const g of gastos) for (const t of g.tags) conteo.set(t, (conteo.get(t) ?? 0) + 1);
    return [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [gastos]);

  // El filtro sigue vigente solo si el tag todavía existe (si no, se ignora).
  const tagActivo = filtroTag && tagsConConteo.some(([t]) => t === filtroTag) ? filtroTag : null;

  const visibles = useMemo(
    () => (tagActivo ? gastos.filter((g) => g.tags.includes(tagActivo)) : gastos),
    [gastos, tagActivo],
  );

  // Total del filtro POR MONEDA (jamás sumadas entre sí).
  const totalFiltro = useMemo<TotalesMoneda>(() => {
    let CRC = 0;
    let USD = 0;
    for (const g of visibles) {
      if (g.moneda === "USD") USD += g.monto;
      else CRC += g.monto;
    }
    return { CRC: round2(CRC), USD: round2(USD) };
  }, [visibles]);

  // Totales por mes (YYYY-MM de la fecha), CRC y USD en columnas separadas, meses desc.
  const totalesPorMes = useMemo(() => {
    const map = new Map<string, { CRC: number; USD: number }>();
    for (const g of gastos) {
      const ym = g.fecha.slice(0, 7);
      const acc = map.get(ym) ?? { CRC: 0, USD: 0 };
      if (g.moneda === "USD") acc.USD += g.monto;
      else acc.CRC += g.monto;
      map.set(ym, acc);
    }
    return [...map.entries()]
      .map(([ym, t]) => ({ ym, CRC: round2(t.CRC), USD: round2(t.USD) }))
      .sort((a, b) => b.ym.localeCompare(a.ym));
  }, [gastos]);

  function abrirCrear() {
    setEditando(null);
    setFormOpen(true);
  }
  function abrirEditar(g: GastoPuntualDTO) {
    setEditando(g);
    setFormOpen(true);
  }
  function cerrarForm() {
    setFormOpen(false);
    setEditando(null);
  }
  function guardado() {
    cerrarForm();
    onChanged();
  }

  async function borrar(id: string) {
    setBorrando(id);
    try {
      await fetchJson(`/api/cobranza/gastos/${id}`, { method: "DELETE" });
      setConfirmarBorrar(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar el gasto.");
    } finally {
      setBorrando(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Header + CTA ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-fg">Gastos puntuales</h3>
          <p className="text-[11px] text-fg-muted">
            Gastos únicos y circunstanciales — referencia estimada.
          </p>
        </div>
        <button
          type="button"
          onClick={abrirCrear}
          className="ml-auto text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors"
        >
          Agregar gasto
        </button>
      </div>

      {gastos.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Sin gastos puntuales"
          description="Agregá un gasto único (un evento, una compra puntual) para llevar el registro. Los futuros entran a la caja neta."
        />
      ) : (
        <>
          {/* ── Chips de tags con conteo + total del filtro ── */}
          {tagsConConteo.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {tagsConConteo.map(([tag, n]) => {
                  const activo = tag === tagActivo;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setFiltroTag(activo ? null : tag)}
                      aria-pressed={activo}
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                        activo
                          ? "border-brand/30 bg-brand/10 text-brand"
                          : "border-line text-fg-secondary hover:bg-surface-hover"
                      }`}
                    >
                      {tag} <span className="opacity-60">({n})</span>
                    </button>
                  );
                })}
              </div>
              {tagActivo && (
                <p className="text-[11px] text-fg-muted">
                  Total {tagActivo}:{" "}
                  <span className="tabular-nums text-fg-secondary font-medium">
                    {fmtMontoVisible(totalFiltro.CRC, "CRC", mostrarDatos)}
                  </span>{" "}
                  ·{" "}
                  <span className="tabular-nums text-fg-secondary font-medium">
                    {fmtMontoVisible(totalFiltro.USD, "USD", mostrarDatos)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiltroTag(null)}
                    className="ml-2 text-brand hover:underline"
                  >
                    Quitar filtro
                  </button>
                </p>
              )}
            </div>
          )}

          {/* ── Lista de gastos (fecha desc — ya vienen ordenados) ── */}
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
            {visibles.map((g) => {
              const planificado = g.fecha > todayISO;
              const confirmando = confirmarBorrar === g.id;
              return (
                <li key={g.id} className="px-4 py-2.5 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-fg text-sm">{g.nombre}</span>
                      {planificado && (
                        <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600">
                          Planificado
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                      <span className="text-xs text-fg-muted">{fmtFecha(g.fecha)}</span>
                      {g.tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-brand/30 bg-brand/10 text-brand"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-fg tabular-nums whitespace-nowrap">
                    {fmtMontoVisible(g.monto, g.moneda, mostrarDatos)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {confirmando ? (
                      <>
                        <button
                          type="button"
                          disabled={borrando === g.id}
                          onClick={() => borrar(g.id)}
                          className="text-[11px] font-medium px-2 py-1 rounded-md border border-red-500/30 text-red-600 bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          {borrando === g.id ? "Borrando…" : "Confirmar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmarBorrar(null)}
                          className="text-[11px] text-fg-muted hover:text-fg px-1.5 py-1"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => abrirEditar(g)}
                          className="text-[11px] font-medium text-brand hover:underline px-1.5 py-1"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmarBorrar(g.id)}
                          className="text-[11px] text-fg-muted hover:text-red-600 transition-colors px-1.5 py-1"
                        >
                          Borrar
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* ── Totales por mes (CRC y USD en columnas separadas) ── */}
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-muted border-b border-line">
                  <th className={TH_CLS}>Mes</th>
                  <th className={`${TH_CLS} text-right`}>CRC</th>
                  <th className={`${TH_CLS} text-right`}>USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {totalesPorMes.map((t) => (
                  <tr key={t.ym}>
                    <td className="px-4 py-2.5 whitespace-nowrap font-medium text-fg">{fmtMes(t.ym)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {t.CRC > 0 ? (
                        <span className="text-fg">{fmtMontoVisible(t.CRC, "CRC", mostrarDatos)}</span>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {t.USD > 0 ? (
                        <span className="text-fg">{fmtMontoVisible(t.USD, "USD", mostrarDatos)}</span>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {formOpen && (
        <GastoForm
          gasto={editando}
          todayISO={todayISO}
          allGastos={gastos}
          onClose={cerrarForm}
          onSaved={guardado}
        />
      )}
    </div>
  );
}
