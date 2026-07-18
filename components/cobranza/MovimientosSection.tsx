"use client";

/**
 * components/cobranza/MovimientosSection.tsx — histórico de altas/bajas/cambios de
 * los costos recurrentes (fase 4.5). Self-fetch (sin props): al montarse trae
 * /api/cobranza/costos/movimientos (append-only, orden fechaEfectiva desc) y lo
 * agrupa por MES. Cifras de referencia — mismo tono que el resto de Costos.
 * ⚠ Datos SUPER_ADMIN-only; el endpoint es la barrera (guardCostosAccess).
 */
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ListSkeleton } from "@/components/ui";
import { fetchJson } from "@/lib/api/fetch-json";
import type { CostoMovimientoDTO } from "@/lib/cobranza";
import { CATEGORIA_COSTO_LABEL } from "@/lib/cobranza/schema";
import { MOVIMIENTO_TIPO_META, FILTER_SELECT_CLS, fmtMonto, fmtFecha } from "./format";

// Meses en español (largos) para el header de cada grupo — sin `new Date` (determinístico).
const MESES_LARGOS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "2026-07" → "julio 2026". */
function mesLargo(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${MESES_LARGOS[m - 1]} ${y}`;
}

type GrupoMes = {
  key: string;
  label: string;
  altas: number;
  bajas: number;
  items: CostoMovimientoDTO[];
};

export default function MovimientosSection() {
  // null = aún sin cargar; "cargando" es DERIVADO (sin data y sin error) — un
  // setState síncrono en el effect dispara renders en cascada (lint, patrón CostoForm).
  const [movimientos, setMovimientos] = useState<CostoMovimientoDTO[] | null>(null);
  const [error, setError] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<string>("TODOS");

  const cargando = movimientos === null && !error;

  useEffect(() => {
    if (movimientos !== null || error) return;
    let cancelado = false;
    fetchJson<{ movimientos: CostoMovimientoDTO[] }>("/api/cobranza/costos/movimientos")
      .then((d) => {
        if (!cancelado) setMovimientos(d.movimientos);
      })
      .catch(() => {
        if (!cancelado) setError(true);
      });
    return () => {
      cancelado = true;
    };
  }, [movimientos, error]);

  // Filtro por tipo (client-side) → agrupado por MES de fechaEfectiva (ya viene desc).
  const grupos = useMemo<GrupoMes[]>(() => {
    const base = movimientos ?? [];
    const filtrados = filtroTipo === "TODOS" ? base : base.filter((m) => m.tipo === filtroTipo);
    const out: GrupoMes[] = [];
    for (const m of filtrados) {
      const key = m.fechaEfectiva.slice(0, 7); // YYYY-MM
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label: mesLargo(key), altas: 0, bajas: 0, items: [] };
        out.push(g);
      }
      g.items.push(m);
      if (m.tipo === "ALTA") g.altas += 1;
      else if (m.tipo === "BAJA") g.bajas += 1;
    }
    return out;
  }, [movimientos, filtroTipo]);

  if (cargando) {
    // Skeleton estructural: filas apiladas ≈ la lista de movimientos agrupada por mes.
    return <ListSkeleton rows={6} rowClassName="h-12" />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 flex flex-wrap items-center gap-3">
        <p className="flex-1 min-w-[200px] text-sm text-red-600">
          No se pudieron cargar los movimientos.
        </p>
        <button
          type="button"
          onClick={() => setError(false)}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-500/30 text-red-600 bg-red-500/10 hover:bg-red-500/20 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if ((movimientos ?? []).length === 0) {
    return (
      <EmptyState
        variant="dashed"
        title="Sin movimientos"
        description="Todavía no hay movimientos registrados."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Filtro por tipo ── */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-fg-muted">
          Altas, bajas y cambios de los costos — registro histórico, referencia de dirección.
        </p>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className={`ml-auto ${FILTER_SELECT_CLS}`}
        >
          <option value="TODOS">Todos los tipos</option>
          {Object.entries(MOVIMIENTO_TIPO_META).map(([tipo, meta]) => (
            <option key={tipo} value={tipo}>
              {meta.label}
            </option>
          ))}
        </select>
      </div>

      {grupos.length === 0 ? (
        <p className="text-xs text-fg-muted px-1 py-4">
          Ningún movimiento de ese tipo.
        </p>
      ) : (
        grupos.map((g) => (
          <div key={g.key} className="rounded-xl border border-line bg-surface overflow-hidden">
            <div className="px-4 py-2.5 bg-surface-muted border-b border-line text-[11px] font-semibold text-fg-muted uppercase tracking-wide">
              {g.label} · {g.altas} alta{g.altas !== 1 ? "s" : ""} · {g.bajas} baja
              {g.bajas !== 1 ? "s" : ""}
            </div>
            <ul className="divide-y divide-line">
              {g.items.map((m) => {
                const meta = MOVIMIENTO_TIPO_META[m.tipo] ?? { label: m.tipo, chip: "text-fg-muted bg-surface-muted border-line" };
                return (
                  <li key={m.id} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${meta.chip}`}
                      >
                        {meta.label}
                      </span>
                      <span className="flex-1 min-w-[160px] truncate text-sm font-medium text-fg">
                        {m.nombre}
                        <span className="font-normal text-fg-muted">
                          {" · "}
                          {CATEGORIA_COSTO_LABEL[m.categoria] ?? m.categoria}
                        </span>
                      </span>
                      <span className="text-sm font-medium tabular-nums text-fg whitespace-nowrap">
                        {m.tipo === "CAMBIO_MONTO" && m.montoAnterior != null ? (
                          <>
                            <span className="text-fg-muted line-through">
                              {fmtMonto(m.montoAnterior, m.moneda)}
                            </span>
                            {" → "}
                            {fmtMonto(m.monto, m.moneda)}
                          </>
                        ) : (
                          fmtMonto(m.monto, m.moneda)
                        )}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-muted">
                      <span>{fmtFecha(m.fechaEfectiva)}</span>
                      {m.usuarioEmail && <span>· {m.usuarioEmail}</span>}
                    </div>
                    {m.notas && (
                      <p className="mt-1 text-xs text-fg-secondary whitespace-pre-wrap">{m.notas}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
