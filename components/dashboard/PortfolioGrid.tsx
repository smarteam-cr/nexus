"use client";

/**
 * components/dashboard/PortfolioGrid.tsx
 *
 * D.3 panel de cartera — PANEL DE ALERTAS por urgencia (no un índice plano). Header con
 * el tablero de control y secciones por severidad:
 *   1. 🔴 Requiere acción ahora  — atrasos REALES (con línea base) + flags manuales de riesgo. Tarjetas con la razón.
 *   2. 💰 Entregando de más       — alcance excedido (alerta de negocio: plata, no tiempo).
 *   3. 🟡 Sin datos para evaluar  — sin línea base / sin validar (setup pendiente; NEUTRO, no rojo).
 *   4. ✅ Saludable / Completados — colapsado por defecto.
 * La clave: separa "atraso real" de "sin datos" con tratamiento visual distinto (lo que el
 * índice plano mezclaba en el mismo rojo). El chip de salud se sigue curando a mano (override).
 */
import { useState, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { plural } from "@/lib/timeline/weeks";
import type { PortfolioRow } from "@/lib/portfolio/load";

type Health = "SALUDABLE" | "EN_FRICCION" | "EN_RIESGO" | "PAUSADO";
type Summary = PortfolioRow["summary"];

const HEALTH_META: Record<Health, { label: string; dot: string; chip: string }> = {
  EN_RIESGO: { label: "En riesgo", dot: "bg-red-500", chip: "text-red-600 bg-red-500/10 border border-red-500/30" },
  EN_FRICCION: { label: "En fricción", dot: "bg-amber-500", chip: "text-amber-600 bg-amber-500/10 border border-amber-500/30" },
  SALUDABLE: { label: "Saludable", dot: "bg-emerald-500", chip: "text-emerald-600 bg-emerald-500/10 border border-emerald-500/30" },
  PAUSADO: { label: "Pausado", dot: "bg-gray-400", chip: "text-fg-muted bg-surface-muted border border-line" },
};
const HEALTH_OPTIONS: Health[] = ["SALUDABLE", "EN_FRICCION", "EN_RIESGO", "PAUSADO"];

// Razones genéricas (defaults del sistema) → no aportan contexto, se tratan como "sin razón".
const GENERIC_REASONS = new Set([
  "Publicación al cliente",
  "Edición manual del cronograma",
  "Creación inicial del cronograma",
  "Actualización del cronograma (IA)",
]);

type Group = "action" | "nodata" | "healthy";

// Ruteo por SEÑALES crudas (no por health.resolved): un proyecto sin baseline pero "stalled"
// (que el motor deriva EN_RIESGO) cae en "sin datos", no en rojo.
function classify(r: PortfolioRow): Group {
  const s = r.summary;
  if (s.health.source === "override") {
    return s.health.override === "EN_RIESGO" || s.health.override === "EN_FRICCION" ? "action" : "healthy";
  }
  if (r.status === "completed" || r.status === "paused") return "healthy";
  if (!s.hasBaseline) return "nodata";
  if (s.overduePhases > 0 || s.overdueTasks > 0 || s.stalled) return "action";
  if (s.weakBaseline) return "nodata";
  return "healthy";
}

// Alerta de alcance (cross-cutting): puede convivir con "Requiere acción".
const isScopeAlert = (r: PortfolioRow) =>
  r.status === "active" && r.summary.scope.measurable && r.summary.scope.exceeded && !r.summary.scope.attenuated;
const scopeMag = (r: PortfolioRow) =>
  r.summary.scope.addedTasks + r.summary.scope.addedPhases + Math.max(0, r.summary.scope.weeksDelta);

function severityScore(r: PortfolioRow): number {
  const s = r.summary;
  let v = 0;
  if (s.health.source === "override") v += 100000; // flags manuales primero
  if (s.overduePhases > 0) v += 50000 + s.worstDaysLate;
  else if (s.stalled) v += 30000 + (s.daysSinceActivity ?? 0);
  else if (s.overdueTasks > 0) v += 10000 + s.worstDaysLate;
  return v;
}

// Atraso concreto para la tarjeta. null si no hay atraso real (p.ej. flag manual sin vencimiento).
function delayLabel(s: Summary): string | null {
  // plural() ya incluye el número (ej. "12 días"), no anteponer otro.
  if (s.worstOverduePhase) return `${s.worstOverduePhase.name} · ${plural(s.worstOverduePhase.daysLate, "día", "días")} tarde`;
  if (s.overdueTasks > 0) return `${plural(s.overdueTasks, "tarea atrasada", "tareas atrasadas")}${s.worstDaysLate > 0 ? ` · ${plural(s.worstDaysLate, "día", "días")}` : ""}`;
  if (s.stalled) return `Sin avance · ${s.daysSinceActivity} días`;
  return null;
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const mo = Math.floor(d / 30);
  return `hace ${plural(mo, "mes", "meses")}`;
}
const shortEmail = (e: string | null) => (e ? e.split("@")[0] : "");

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

interface ClientGroup { clientId: string; clientName: string; clientCompany: string | null; items: PortfolioRow[] }
// Agrupa por cliente PRESERVANDO el orden de la sección: cada cliente toma la posición de su
// primer proyecto (el más urgente/relevante de esa sección) y sus proyectos quedan juntos debajo.
function groupByClient(items: PortfolioRow[]): ClientGroup[] {
  const order: string[] = [];
  const map = new Map<string, PortfolioRow[]>();
  for (const r of items) {
    let g = map.get(r.clientId);
    if (!g) { g = []; map.set(r.clientId, g); order.push(r.clientId); }
    g.push(r);
  }
  return order.map((id) => {
    const its = map.get(id)!;
    return { clientId: id, clientName: its[0].clientName, clientCompany: its[0].clientCompany, items: its };
  });
}

export default function PortfolioGrid({ rows: initialRows }: { rows: PortfolioRow[] }) {
  const toast = useToast();
  const [rows, setRows] = useState(initialRows);
  const [q, setQ] = useState("");
  const [cseFilter, setCseFilter] = useState("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [showHealthy, setShowHealthy] = useState(false);

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
    if (cseFilter !== "all") list = list.filter((r) => r.cseName === cseFilter);
    return list;
  }, [rows, q, cseFilter]);

  const { action, nodata, healthy, scopeAlerts } = useMemo(() => {
    const action: PortfolioRow[] = [], nodata: PortfolioRow[] = [], healthy: PortfolioRow[] = [];
    for (const r of filtered) {
      const g = classify(r);
      if (g === "action") action.push(r);
      else if (g === "nodata") nodata.push(r);
      else if (!isScopeAlert(r)) healthy.push(r); // on-time pero con alcance excedido → solo Sección 2, no "sano"
    }
    action.sort((a, b) => severityScore(b) - severityScore(a));
    nodata.sort((a, b) => a.projectName.localeCompare(b.projectName));
    healthy.sort((a, b) => a.projectName.localeCompare(b.projectName));
    const scopeAlerts = filtered.filter(isScopeAlert).sort((a, b) => scopeMag(b) - scopeMag(a));
    return { action, nodata, healthy, scopeAlerts };
  }, [filtered]);

  const healthyBreak = useMemo(() => {
    let san = 0, comp = 0, pau = 0;
    for (const r of healthy) {
      if (r.status === "completed") comp++;
      else if (r.status === "paused" || r.summary.health.resolved === "PAUSADO") pau++;
      else san++;
    }
    return { san, comp, pau };
  }, [healthy]);

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

  const filtering = !!q.trim() || cseFilter !== "all";

  return (
    <div className="space-y-7">
      {/* ── Tablero de control ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Requiere acción" count={action.length} tone="red" onClick={() => scrollTo("sec-action")} />
        <Stat label="Alcance excedido" count={scopeAlerts.length} tone="amber" onClick={() => scrollTo("sec-scope")} />
        <Stat label="Sin datos" count={nodata.length} tone="neutral" onClick={() => scrollTo("sec-nodata")} />
        <Stat label="Saludable" count={healthy.length} tone="emerald" onClick={() => { setShowHealthy(true); scrollTo("sec-healthy"); }} />
      </div>

      {/* ── Búsqueda + CSE ── */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar proyecto, cliente o CSE…"
          className="text-xs border border-line rounded-lg px-3 py-1.5 bg-surface text-fg focus:outline-none focus:border-brand w-64"
        />
        <select
          value={cseFilter}
          onChange={(e) => setCseFilter(e.target.value)}
          className="text-[11px] border border-line rounded-md px-2 py-1.5 bg-surface text-fg focus:outline-none focus:border-brand"
        >
          <option value="all">Todos los CSE</option>
          {cseOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {filtering && <span className="text-[11px] text-fg-muted">{filtered.length} de {rows.length}</span>}
      </div>

      {/* ── 1. Requiere acción ahora ── */}
      <section id="sec-action" className="scroll-mt-4">
        <SectionHeader icon="🔴" title="Requiere acción ahora" count={action.length} />
        {action.length === 0 ? (
          <p className="text-sm text-emerald-600 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
            ✅ Nada urgente — ningún proyecto atrasado.
          </p>
        ) : (
          <div className="space-y-5">
            {groupByClient(action).map((g) => (
              <div key={g.clientId} className="space-y-2">
                <ClientLabel g={g} />
                {g.items.map((r) => (
                  <ActionCard key={r.projectId} r={r} editing={editing} setEditing={setEditing} onSetHealth={setHealth} />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 2. Entregando de más (alcance) ── */}
      {scopeAlerts.length > 0 && (
        <section id="sec-scope" className="scroll-mt-4">
          <SectionHeader icon="💰" title="Entregando de más" count={scopeAlerts.length} sub="alcance excedido vs lo vendido" />
          <div className="bg-surface border border-line rounded-xl divide-y divide-line overflow-hidden">
            {groupByClient(scopeAlerts).flatMap((g) => [
              <ClientHeaderRow key={`h-${g.clientId}`} g={g} />,
              ...g.items.map((r) => <ScopeRow key={r.projectId} r={r} />),
            ])}
          </div>
        </section>
      )}

      {/* ── 3. Sin datos para evaluar ── */}
      {nodata.length > 0 && (
        <section id="sec-nodata" className="scroll-mt-4">
          <SectionHeader icon="🟡" title="Sin datos para evaluar" count={nodata.length} sub="setup pendiente, no rescate" />
          <div className="bg-surface border border-line rounded-xl divide-y divide-line overflow-hidden">
            {groupByClient(nodata).flatMap((g) => [
              <ClientHeaderRow
                key={`h-${g.clientId}`}
                g={g}
                right={<SetupPill state={g.items[0].setup.procesos ? "done" : "missing"} label={g.items[0].setup.procesos ? "✓ Procesos" : "Sin procesos"} />}
              />,
              ...g.items.map((r) => <NodataRow key={r.projectId} r={r} />),
            ])}
          </div>
        </section>
      )}

      {/* ── 4. Saludable / Completados (colapsado) ── */}
      <section id="sec-healthy" className="scroll-mt-4">
        <button
          onClick={() => setShowHealthy((v) => !v)}
          className="w-full flex items-center gap-2 text-left text-sm font-medium text-fg-secondary hover:text-fg bg-surface border border-line rounded-xl px-4 py-2.5 transition-colors"
        >
          <span className="text-emerald-600">✅</span>
          <span>
            {healthy.length} sin alertas
            {healthy.length > 0 && (
              <span className="text-fg-muted font-normal text-xs">
                {" · "}
                {[
                  healthyBreak.san > 0 && plural(healthyBreak.san, "saludable", "saludables"),
                  healthyBreak.comp > 0 && plural(healthyBreak.comp, "completado", "completados"),
                  healthyBreak.pau > 0 && plural(healthyBreak.pau, "pausado", "pausados"),
                ].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
          <span className="ml-auto text-fg-muted text-xs">{showHealthy ? "▾" : "▸"}</span>
        </button>
        {showHealthy && healthy.length > 0 && (
          <div className="mt-2 bg-surface border border-line rounded-xl divide-y divide-line overflow-hidden">
            {groupByClient(healthy).flatMap((g) => [
              <ClientHeaderRow key={`h-${g.clientId}`} g={g} />,
              ...g.items.map((r) => <HealthyRow key={r.projectId} r={r} />),
            ])}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Tablero ──
function Stat({ label, count, tone, onClick }: { label: string; count: number; tone: "red" | "amber" | "neutral" | "emerald"; onClick: () => void }) {
  const tones = {
    red: "text-red-600 border-red-500/30 bg-red-500/5",
    amber: "text-amber-600 border-amber-500/30 bg-amber-500/5",
    neutral: "text-fg-secondary border-line bg-surface-muted/40",
    emerald: "text-emerald-600 border-emerald-500/30 bg-emerald-500/5",
  }[tone];
  return (
    <button onClick={onClick} className={`text-left rounded-xl border p-3 transition hover:brightness-110 ${tones}`}>
      <div className="text-2xl font-bold tabular-nums leading-none">{count}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80 mt-1.5">{label}</div>
    </button>
  );
}

function SectionHeader({ icon, title, count, sub }: { icon: string; title: string; count: number; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-2.5">
      <h2 className="text-sm font-bold text-fg">{icon} {title}</h2>
      <span className="text-xs font-semibold text-fg-muted tabular-nums">{count}</span>
      {sub && <span className="text-[11px] text-fg-muted">· {sub}</span>}
    </div>
  );
}

// Encabezado de cliente para la sección de tarjetas (label arriba del grupo).
function ClientLabel({ g }: { g: ClientGroup }) {
  return (
    <Link href={`/clients/${g.clientId}`} className="inline-flex items-baseline gap-1.5 px-2 py-0.5 rounded bg-blue-500/[0.06] text-[11px] font-semibold uppercase tracking-wide text-fg-secondary hover:bg-blue-500/10 hover:text-brand transition-colors">
      {g.clientCompany || g.clientName}
      {g.items.length > 1 && <span className="text-[10px] font-normal normal-case text-fg-muted">· {plural(g.items.length, "proyecto", "proyectos")}</span>}
    </Link>
  );
}

// Encabezado de cliente para las secciones de filas compactas (fila con fondo azul muy tenue).
// `right` permite colgar info a nivel CLIENTE (p.ej. el pill de procesos, que es compartido).
function ClientHeaderRow({ g, right }: { g: ClientGroup; right?: ReactNode }) {
  return (
    <Link href={`/clients/${g.clientId}`} className="flex items-center gap-2 px-4 py-1.5 bg-blue-500/[0.06] hover:bg-blue-500/10 transition-colors">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-secondary truncate">{g.clientCompany || g.clientName}</span>
      {g.items.length > 1 && <span className="text-[10px] text-fg-muted">· {g.items.length}</span>}
      {right && <span className="ml-auto flex-shrink-0">{right}</span>}
    </Link>
  );
}

// Pill de un paso del setup: done (verde) / draft (ámbar) / missing (rojo).
function SetupPill({ state, label }: { state: "done" | "draft" | "missing"; label: string }) {
  const cls = {
    done: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
    draft: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    missing: "text-red-600 bg-red-500/10 border-red-500/25",
  }[state];
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${cls}`}>{label}</span>;
}

// Deep-link al panel del cliente con el tab del proyecto seleccionado (?tab=), NO a la página
// suelta /projects/[id] (que tiene su propio layout sin el rail de tabs). WorkspaceClient lee
// ?tab= al montar y restaura ese proyecto — el filtro de visibles del cliente coincide con el
// del panel, así que el projectId siempre existe en el rail.
const projectHref = (r: PortfolioRow) => `/clients/${r.clientId}?tab=${r.projectId}`;

// ── Sección 1: tarjeta rica ──
function ActionCard({
  r, editing, setEditing, onSetHealth,
}: {
  r: PortfolioRow;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onSetHealth: (projectId: string, status: Health | null, reason: string) => void;
}) {
  const s = r.summary;
  const pct = Math.round(s.progress.pct * 100);
  const isOverride = s.health.source === "override";
  const dl = delayLabel(s);
  // Razón a mostrar: la del override (si lo marcaron a mano) o la última razón humana del cronograma.
  const rawReason = isOverride ? r.healthOverrideReason : r.lastChange?.reason ?? null;
  const reason = rawReason && !GENERIC_REASONS.has(rawReason.trim()) ? rawReason.trim() : null;
  const by = isOverride ? r.healthOverrideBy : r.lastChange?.byEmail ?? null;
  const at = isOverride ? r.healthOverrideAt : r.lastChange?.at ?? null;

  return (
    <div className="rounded-xl border border-line border-l-4 border-l-red-500 bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={projectHref(r)} className="font-semibold text-fg hover:text-brand transition-colors">
            {r.projectName}
          </Link>
          <div className="text-[11px] text-fg-muted truncate">{r.cseName || "sin CSE"}</div>
        </div>
        <HealthChip r={r} editing={editing} setEditing={setEditing} onSetHealth={onSetHealth} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-red-600">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          {dl ?? "Riesgo marcado a mano"}
        </span>
        <span className="text-fg-muted tabular-nums">
          {pct}% avance · {s.progress.tasksTotal > 0 ? `${s.progress.tasksDone}/${s.progress.tasksTotal} tareas` : `${s.progress.phasesDone}/${s.progress.phasesTotal} fases`}
        </span>
      </div>

      {/* Razón (el porqué) */}
      <div className="mt-2.5 rounded-lg bg-surface-muted/70 px-3 py-2 text-xs leading-relaxed">
        {reason ? (
          <>
            <span className="text-fg-secondary">💬 «{reason}»</span>
            {(by || at) && <span className="text-fg-muted"> — {shortEmail(by)}{at ? `, ${relTime(at)}` : ""}</span>}
          </>
        ) : (
          <span className="text-fg-muted">Sin motivo registrado del último cambio del cronograma.</span>
        )}
      </div>
    </div>
  );
}

// ── Sección 2: alcance excedido ──
function ScopeRow({ r }: { r: PortfolioRow }) {
  const s = r.summary.scope;
  const parts = [
    s.addedTasks > 0 && `+${plural(s.addedTasks, "tarea", "tareas")}`,
    s.addedPhases > 0 && `+${plural(s.addedPhases, "fase", "fases")}`,
    s.weeksDelta > 0 && `+${s.weeksDelta} sem`,
  ].filter(Boolean).join(" · ");
  return (
    <Link href={projectHref(r)} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-muted/40 transition-colors">
      <div className="min-w-0">
        <span className="text-sm font-medium text-fg">{r.projectName}</span>
        <span className="text-[11px] text-fg-muted"> · {r.cseName || "sin CSE"}</span>
      </div>
      <span className="text-xs font-semibold text-amber-600 whitespace-nowrap">{parts} <span className="text-fg-muted font-normal">vs vendido</span></span>
    </Link>
  );
}

// ── Sección 3: sin datos (neutro) — checklist de setup ──
function NodataRow({ r }: { r: PortfolioRow }) {
  // weakBaseline (tiene línea base pero débil) NO es setup pendiente → nota simple, sin checklist.
  if (r.summary.hasBaseline) {
    return (
      <Link href={projectHref(r)} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-muted/40 transition-colors">
        <div className="min-w-0">
          <span className="text-sm text-fg">{r.projectName}</span>
          <span className="text-[11px] text-fg-muted"> · {r.cseName || "sin CSE"}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400/50" />Línea base sin validar
        </span>
      </Link>
    );
  }
  const s = r.setup;
  return (
    <Link href={projectHref(r)} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-muted/40 transition-colors">
      <div className="min-w-0">
        <span className="text-sm text-fg">{r.projectName}</span>
        <span className="text-[11px] text-fg-muted"> · {r.cseName || "sin CSE"}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
        <SetupPill state={s.handoff ? "done" : "missing"} label={s.handoff ? "✓ Handoff" : "Sin handoff"} />
        <SetupPill state={s.kickoff ? "done" : "missing"} label={s.kickoff ? "✓ Kickoff" : "Sin kickoff"} />
        <SetupPill
          state={s.cronograma === "publicado" ? "done" : s.cronograma === "borrador" ? "draft" : "missing"}
          label={s.cronograma === "publicado" ? "✓ Cronograma" : s.cronograma === "borrador" ? "Cronograma sin subir" : "Sin cronograma"}
        />
      </div>
    </Link>
  );
}

// ── Sección 4: sano/completado (atenuado) ──
function HealthyRow({ r }: { r: PortfolioRow }) {
  const isCompleted = r.status === "completed";
  const showCompleted = isCompleted && r.summary.health.source === "derived";
  const badge = showCompleted
    ? { label: "Completado", dot: "bg-gray-400", chip: "text-fg-muted bg-surface-muted border border-line" }
    : HEALTH_META[r.summary.health.resolved as Health];
  return (
    <Link href={projectHref(r)} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-surface-muted/40 transition-colors opacity-85">
      <div className="min-w-0">
        <span className="text-sm text-fg">{r.projectName}</span>
        <span className="text-[11px] text-fg-muted"> · {r.cseName || "—"}</span>
      </div>
      <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.chip}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />{badge.label}
      </span>
    </Link>
  );
}

// ── Chip de salud editable (override curado) ──
function HealthChip({
  r, editing, setEditing, onSetHealth,
}: {
  r: PortfolioRow;
  editing: string | null;
  setEditing: (id: string | null) => void;
  onSetHealth: (projectId: string, status: Health | null, reason: string) => void;
}) {
  const s = r.summary;
  const badge = HEALTH_META[s.health.resolved as Health];
  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setEditing(editing === r.projectId ? null : r.projectId)}
        className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.chip}`}
        title={s.health.source === "override" ? `Manual${r.healthOverrideReason ? `: ${r.healthOverrideReason}` : ""}` : "Sugerido por el sistema — clic para fijar"}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
        {badge.label}
        <span className="text-[9px] opacity-70">{s.health.source === "override" ? "· manual" : "· sugerido"}</span>
      </button>
      {editing === r.projectId && (
        <HealthPopover r={r} onSet={(status, reason) => onSetHealth(r.projectId, status, reason)} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function HealthPopover({
  r, onSet, onClose,
}: {
  r: PortfolioRow;
  onSet: (status: Health | null, reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(r.healthOverrideReason ?? "");
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute z-20 mt-1 right-0 w-60 bg-surface border border-line rounded-xl shadow-[0_10px_40px_-12px_rgba(0,0,0,0.55)] p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-fg-muted">Fijar estado (manual)</p>
        <div className="grid grid-cols-2 gap-1">
          {HEALTH_OPTIONS.map((h) => (
            <button
              key={h}
              onClick={() => onSet(h, reason)}
              className={`text-[11px] px-2 py-1 rounded-md ${HEALTH_META[h].chip} ${r.summary.health.override === h ? "ring-1 ring-brand" : ""}`}
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
        <button onClick={() => onSet(null, "")} className="text-[11px] text-brand hover:text-brand/80">
          ← Volver al automático
        </button>
      </div>
    </>
  );
}
