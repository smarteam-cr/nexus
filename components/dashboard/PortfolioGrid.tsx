"use client";

/**
 * components/dashboard/PortfolioGrid.tsx
 *
 * D.3 panel de cartera — tabla de mando: una fila por proyecto con los tres ejes
 * (cartera / avance-riesgo / control de alcance). Filtros, orden y agrupado por cliente
 * en el browser (como ClientsGrid). El badge de salud se edita inline (override curado;
 * patrón propone→confirma). Hereda los tokens de tema de Nexus.
 */
import { useState, useMemo } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import type { PortfolioRow } from "@/lib/portfolio/load";

type Health = "SALUDABLE" | "EN_FRICCION" | "EN_RIESGO" | "PAUSADO";

const HEALTH_META: Record<Health, { label: string; dot: string; chip: string }> = {
  EN_RIESGO: { label: "En riesgo", dot: "bg-red-500", chip: "text-red-600 bg-red-500/10 border border-red-500/30" },
  EN_FRICCION: { label: "En fricción", dot: "bg-amber-500", chip: "text-amber-600 bg-amber-500/10 border border-amber-500/30" },
  SALUDABLE: { label: "Saludable", dot: "bg-emerald-500", chip: "text-emerald-600 bg-emerald-500/10 border border-emerald-500/30" },
  PAUSADO: { label: "Pausado", dot: "bg-gray-400", chip: "text-fg-muted bg-surface-muted border border-line" },
};
const SEVERITY: Record<Health, number> = { EN_RIESGO: 3, EN_FRICCION: 2, SALUDABLE: 1, PAUSADO: 0 };
const HEALTH_OPTIONS: Health[] = ["SALUDABLE", "EN_FRICCION", "EN_RIESGO", "PAUSADO"];

type SortBy = "severity" | "progress" | "scope" | "cse";

const hasRisk = (r: PortfolioRow) =>
  r.summary.overduePhases + r.summary.overdueTasks > 0 || r.summary.stalled || r.summary.weakBaseline;
const scopeExceeded = (r: PortfolioRow) =>
  r.summary.scope.measurable && r.summary.scope.exceeded && !r.summary.scope.attenuated;
const scopeMagnitude = (r: PortfolioRow) => {
  const s = r.summary.scope;
  return s.measurable ? s.addedTasks + s.addedPhases + Math.max(0, s.weeksDelta) : 0;
};

export default function PortfolioGrid({ rows: initialRows }: { rows: PortfolioRow[] }) {
  const toast = useToast();
  const [rows, setRows] = useState(initialRows);
  const [q, setQ] = useState("");
  const [healthFilter, setHealthFilter] = useState<Health | "all">("all");
  const [onlyRisk, setOnlyRisk] = useState(false);
  const [onlyScope, setOnlyScope] = useState(false);
  const [cseFilter, setCseFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("severity");
  const [groupByClient, setGroupByClient] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const cseOptions = useMemo(
    () => [...new Set(rows.map((r) => r.cseName).filter((n): n is string => !!n))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    let list = rows;
    const s = q.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (r) =>
          r.projectName.toLowerCase().includes(s) ||
          r.clientName.toLowerCase().includes(s) ||
          (r.cseName ?? "").toLowerCase().includes(s),
      );
    }
    if (healthFilter !== "all") list = list.filter((r) => r.summary.health.resolved === healthFilter);
    if (onlyRisk) list = list.filter(hasRisk);
    if (onlyScope) list = list.filter(scopeExceeded);
    if (cseFilter !== "all") list = list.filter((r) => r.cseName === cseFilter);

    return [...list].sort((a, b) => {
      if (sortBy === "severity") {
        const d = SEVERITY[b.summary.health.resolved as Health] - SEVERITY[a.summary.health.resolved as Health];
        return d !== 0 ? d : b.summary.worstDaysLate - a.summary.worstDaysLate;
      }
      if (sortBy === "progress") return a.summary.progress.pct - b.summary.progress.pct;
      if (sortBy === "scope") return scopeMagnitude(b) - scopeMagnitude(a);
      return (a.cseName ?? "~").localeCompare(b.cseName ?? "~");
    });
  }, [rows, q, healthFilter, onlyRisk, onlyScope, cseFilter, sortBy]);

  const grouped = useMemo(() => {
    if (!groupByClient) return null;
    const map = new Map<string, { clientName: string; rows: PortfolioRow[] }>();
    for (const r of filtered) {
      const g = map.get(r.clientId) ?? { clientName: r.clientName, rows: [] };
      g.rows.push(r);
      map.set(r.clientId, g);
    }
    return [...map.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [filtered, groupByClient]);

  async function setHealth(projectId: string, status: Health | null, reason: string) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.projectId !== projectId) return r;
        const resolved = status ?? r.summary.health.derived;
        return {
          ...r,
          summary: { ...r.summary, health: { ...r.summary.health, override: status, resolved, source: status ? "override" : "derived" } },
          healthOverrideReason: status ? reason || null : null,
        };
      }),
    );
    setEditing(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/health`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(status ? { status, reason } : { status: null }),
      });
      if (!res.ok) toast.error("No se pudo actualizar el estado.");
      else toast.success(status ? "Estado actualizado." : "Volvió al estado automático.");
    } catch {
      toast.error("Error de conexión.");
    }
  }

  const th = "text-left text-[10px] font-semibold text-fg-muted uppercase tracking-wide px-3 py-2";

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar proyecto, cliente o CSE…"
          className="text-xs border border-line rounded-lg px-3 py-1.5 bg-surface text-fg focus:outline-none focus:border-brand w-56"
        />
        <div className="flex items-center gap-1">
          {(["all", ...HEALTH_OPTIONS] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHealthFilter(h)}
              className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                healthFilter === h ? "border-brand text-brand bg-brand/10" : "border-line text-fg-muted hover:text-fg"
              }`}
            >
              {h === "all" ? "Todas" : HEALTH_META[h].label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOnlyRisk((v) => !v)}
          className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${onlyRisk ? "border-red-500/40 text-red-600 bg-red-500/10" : "border-line text-fg-muted hover:text-fg"}`}
        >
          Solo con riesgo
        </button>
        <button
          onClick={() => setOnlyScope((v) => !v)}
          className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${onlyScope ? "border-amber-500/40 text-amber-600 bg-amber-500/10" : "border-line text-fg-muted hover:text-fg"}`}
        >
          Solo alcance excedido
        </button>
        <select
          value={cseFilter}
          onChange={(e) => setCseFilter(e.target.value)}
          className="text-[11px] border border-line rounded-md px-2 py-1 bg-surface text-fg focus:outline-none focus:border-brand"
        >
          <option value="all">Todos los CSE</option>
          {cseOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="flex-1" />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="text-[11px] border border-line rounded-md px-2 py-1 bg-surface text-fg focus:outline-none focus:border-brand"
        >
          <option value="severity">Orden: severidad</option>
          <option value="progress">Orden: avance ↑</option>
          <option value="scope">Orden: alcance excedido</option>
          <option value="cse">Orden: CSE</option>
        </select>
        <button
          onClick={() => setGroupByClient((v) => !v)}
          className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${groupByClient ? "border-brand text-brand bg-brand/10" : "border-line text-fg-muted hover:text-fg"}`}
        >
          Agrupar por cliente
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-fg-muted py-12 text-center">Ningún proyecto coincide con los filtros.</p>
      ) : (
        <div className="bg-surface border border-line rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted border-b border-line">
              <tr>
                <th className={th}>Proyecto</th>
                <th className={th}>CSE</th>
                <th className={th}>Etapa</th>
                <th className={th}>Avance</th>
                <th className={th}>Salud</th>
                <th className={th}>Riesgos</th>
                <th className={th}>Alcance</th>
              </tr>
            </thead>
            {grouped ? (
              grouped.map((g) => (
                <tbody key={g.clientName}>
                  <tr className="bg-surface-muted/50">
                    <td colSpan={7} className="px-3 py-1.5 text-[11px] font-semibold text-fg-secondary">
                      {g.clientName} · {g.rows.length}
                    </td>
                  </tr>
                  {g.rows.map((r) => (
                    <Row key={r.projectId} r={r} editing={editing} setEditing={setEditing} onSetHealth={setHealth} />
                  ))}
                </tbody>
              ))
            ) : (
              <tbody>
                {filtered.map((r) => (
                  <Row key={r.projectId} r={r} editing={editing} setEditing={setEditing} onSetHealth={setHealth} />
                ))}
              </tbody>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

function Row({
  r,
  editing,
  setEditing,
  onSetHealth,
}: {
  r: PortfolioRow;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onSetHealth: (projectId: string, status: Health | null, reason: string) => void;
}) {
  const s = r.summary;
  const resolved = s.health.resolved as Health;
  const meta = HEALTH_META[resolved];
  const pct = Math.round(s.progress.pct * 100);
  const overdue = s.overduePhases + s.overdueTasks;

  const scopeParts: string[] = [];
  if (s.scope.measurable) {
    if (s.scope.addedTasks > 0) scopeParts.push(`+${s.scope.addedTasks} tar`);
    if (s.scope.addedPhases > 0) scopeParts.push(`+${s.scope.addedPhases} fas`);
    if (s.scope.weeksDelta > 0) scopeParts.push(`+${s.scope.weeksDelta} sem`);
  }

  return (
    <tr className="border-b border-line last:border-0 hover:bg-surface-muted/40 transition-colors">
      {/* Proyecto */}
      <td className="px-3 py-2.5 align-top">
        <Link href={`/clients/${r.clientId}/projects/${r.projectId}`} className="text-fg font-medium hover:text-brand transition-colors">
          {r.projectName}
        </Link>
        <div className="text-[11px] text-fg-muted truncate max-w-[16rem]">{r.clientCompany || r.clientName}</div>
      </td>
      {/* CSE */}
      <td className="px-3 py-2.5 align-top text-xs text-fg-secondary">{r.cseName || "—"}</td>
      {/* Etapa */}
      <td className="px-3 py-2.5 align-top text-xs text-fg-secondary">{r.stageLabel || "—"}</td>
      {/* Avance */}
      <td className="px-3 py-2.5 align-top w-36">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
            <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium text-fg tabular-nums">{pct}%</span>
        </div>
        <div className="text-[10px] text-fg-muted mt-0.5">
          {s.progress.tasksTotal > 0
            ? `${s.progress.tasksDone}/${s.progress.tasksTotal} tareas`
            : `${s.progress.phasesDone}/${s.progress.phasesTotal} fases`}
        </div>
      </td>
      {/* Salud */}
      <td className="px-3 py-2.5 align-top relative">
        <button
          onClick={() => setEditing(editing === r.projectId ? null : r.projectId)}
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${meta.chip}`}
          title={
            s.health.source === "override"
              ? `Manual${r.healthOverrideReason ? `: ${r.healthOverrideReason}` : ""}`
              : "Sugerido por el sistema — clic para fijar"
          }
        >
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
          <span className="text-[9px] opacity-70">{s.health.source === "override" ? "· manual" : "· sugerido"}</span>
        </button>
        {editing === r.projectId && (
          <HealthPopover r={r} onSet={(status, reason) => onSetHealth(r.projectId, status, reason)} onClose={() => setEditing(null)} />
        )}
      </td>
      {/* Riesgos */}
      <td className="px-3 py-2.5 align-top">
        <div className="flex flex-wrap gap-1">
          {overdue > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded text-red-600 bg-red-500/10 border border-red-500/30">
              Atrasado {overdue}{s.worstDaysLate > 0 ? ` · ${s.worstDaysLate}d` : ""}
            </span>
          )}
          {s.stalled && (
            <span className="text-[10px] px-1.5 py-0.5 rounded text-amber-600 bg-amber-500/10 border border-amber-500/30">
              Sin avance {s.daysSinceActivity}d
            </span>
          )}
          {s.weakBaseline && (
            <span className="text-[10px] px-1.5 py-0.5 rounded text-fg-muted bg-surface-muted border border-line">
              Base débil
            </span>
          )}
          {overdue === 0 && !s.stalled && !s.weakBaseline && <span className="text-[11px] text-fg-muted">—</span>}
        </div>
      </td>
      {/* Alcance */}
      <td className="px-3 py-2.5 align-top">
        {!s.scope.measurable ? (
          <span className="text-[11px] text-fg-muted">Sin línea base</span>
        ) : scopeParts.length > 0 ? (
          <span
            className={`text-[11px] font-medium ${s.scope.attenuated ? "text-fg-muted" : "text-amber-600"}`}
            title={s.scope.attenuated ? "Baseline débil: probablemente detalle, no extra real" : "Trabajo agregado después de publicar el baseline"}
          >
            {scopeParts.join(" · ")}
            {s.scope.attenuated ? " (base débil)" : ""}
          </span>
        ) : (
          <span className="text-[11px] text-emerald-600">En alcance</span>
        )}
      </td>
    </tr>
  );
}

function HealthPopover({
  r,
  onSet,
  onClose,
}: {
  r: PortfolioRow;
  onSet: (status: Health | null, reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(r.healthOverrideReason ?? "");
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute z-20 mt-1 left-3 w-60 bg-surface border border-line rounded-xl shadow-[0_10px_40px_-12px_rgba(0,0,0,0.55)] p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-fg-muted">Fijar estado (manual)</p>
        <div className="grid grid-cols-2 gap-1">
          {HEALTH_OPTIONS.map((h) => (
            <button
              key={h}
              onClick={() => onSet(h, reason)}
              className={`text-[11px] px-2 py-1 rounded-md ${HEALTH_META[h].chip} ${
                r.summary.health.override === h ? "ring-1 ring-brand" : ""
              }`}
            >
              {HEALTH_META[h].label}
            </button>
          ))}
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (opcional)…"
          className="w-full text-xs border border-line rounded px-2 py-1 bg-surface-muted text-fg focus:outline-none focus:border-brand"
        />
        <button
          onClick={() => onSet(null, "")}
          className="text-[11px] text-brand hover:text-brand/80"
        >
          ← Volver al automático
        </button>
      </div>
    </>
  );
}
