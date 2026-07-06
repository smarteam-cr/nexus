"use client";

/**
 * components/cs/AlertsFeed.tsx
 *
 * Feed de alertas del watchdog — el corazón del panel de Éxito del cliente.
 * Triado por severidad → última detección; acciones Vista/Resolver/Descartar
 * (optimistas); filtros por estado/severidad/cliente; evidencia expandible con
 * deep-links al proyecto/cronograma.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { CsAlertRow } from "@/lib/cs/load-panel";

const SEV_META: Record<CsAlertRow["severity"], { label: string; chip: string; dot: string }> = {
  HIGH: { label: "Alta", chip: "text-red-600 bg-red-500/10 border-red-500/30", dot: "bg-red-500" },
  MEDIUM: { label: "Media", chip: "text-amber-600 bg-amber-500/10 border-amber-500/30", dot: "bg-amber-500" },
  LOW: { label: "Baja", chip: "text-sky-600 bg-sky-500/10 border-sky-500/30", dot: "bg-sky-500" },
};

const CATEGORY_LABEL: Record<string, string> = {
  TIMELINE_OVERDUE: "Cronograma atrasado",
  TASK_MODIFICATION: "Cambio de tareas",
  SESSION_MISSED: "Sesión caída",
  PIPELINE_MISMATCH: "Pipeline desalineado",
  ENGAGEMENT_COLD: "Cliente frío",
  SUPPORT_TICKETS: "Tickets de soporte",
  RENEWAL_RISK: "Renovación",
  CHURN_RISK: "Riesgo de churn",
  EXPANSION_OPPORTUNITY: "Expansión",
  PROACTIVE_ACTION: "Acción proactiva",
  ADOPTION_RISK: "Adopción en riesgo",
  LICENSE_UNUSED: "Licencias sin usar",
  PROJECT_BLOCKED: "Bloqueado en HubSpot",
  OTHER: "Otro",
};

function relTime(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  return `hace ${d} días`;
}

export default function AlertsFeed({ initialAlerts }: { initialAlerts: CsAlertRow[] }) {
  const toast = useToast();
  const [alerts, setAlerts] = useState(initialAlerts);
  const [sevFilter, setSevFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const clients = useMemo(
    () => [...new Set(alerts.map((a) => a.clientName).filter(Boolean))].sort(),
    [alerts],
  );

  const visible = useMemo(() => {
    let list = alerts.filter((a) => a.status === "OPEN" || a.status === "SEEN");
    if (sevFilter !== "all") list = list.filter((a) => a.severity === sevFilter);
    if (clientFilter !== "all") list = list.filter((a) => a.clientName === clientFilter);
    return list;
  }, [alerts, sevFilter, clientFilter]);

  async function setStatus(id: string, status: "SEEN" | "RESOLVED" | "DISMISSED") {
    // Revert por-alerta (no snapshot del array entero): con dos PATCH en vuelo,
    // revertir el snapshot pisaría el estado confirmado de la OTRA alerta.
    const prevStatus = alerts.find((a) => a.id === id)?.status;
    setAlerts((as) => as.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      await fetchJson(`/api/cs/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch (e) {
      if (prevStatus) {
        setAlerts((as) => as.map((a) => (a.id === id ? { ...a, status: prevStatus } : a)));
      }
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar la alerta.");
    }
  }

  if (alerts.filter((a) => a.status === "OPEN" || a.status === "SEEN").length === 0) {
    return (
      <p className="text-sm text-emerald-600 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
        ✅ Sin alertas del watchdog — nada pendiente de tu atención.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sevFilter}
          onChange={(e) => setSevFilter(e.target.value)}
          className="text-[11px] border border-line rounded-md px-2 py-1.5 bg-surface text-fg focus:outline-none focus:border-brand"
        >
          <option value="all">Toda severidad</option>
          <option value="HIGH">Alta</option>
          <option value="MEDIUM">Media</option>
          <option value="LOW">Baja</option>
        </select>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="text-[11px] border border-line rounded-md px-2 py-1.5 bg-surface text-fg focus:outline-none focus:border-brand"
        >
          <option value="all">Todos los clientes</option>
          {clients.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span className="text-[11px] text-fg-muted">{visible.length} vigente{visible.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="space-y-2">
        {visible.map((a) => {
          const sev = SEV_META[a.severity];
          const isNew = a.status === "OPEN";
          return (
            <div key={a.id} className={`bg-surface border rounded-xl px-4 py-3 ${isNew ? "border-l-4" : "border-line"}`}
              style={isNew ? { borderLeftColor: a.severity === "HIGH" ? "#ef4444" : a.severity === "MEDIUM" ? "#f59e0b" : "#0ea5e9" } : undefined}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${sev.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${sev.chip}`}>{sev.label}</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-muted">
                      {CATEGORY_LABEL[a.category] ?? a.category}
                    </span>
                    {a.occurrences > 1 && (
                      <span className="text-[10px] text-fg-muted">detectada ×{a.occurrences}</span>
                    )}
                    <span className="text-[10px] text-fg-muted">· {relTime(a.lastDetectedAt)}</span>
                    {a.status === "SEEN" && <span className="text-[10px] text-fg-muted">· vista</span>}
                  </div>
                  <p className="text-sm font-semibold text-fg mt-1">{a.title}</p>
                  <p className="text-xs text-fg-secondary mt-0.5">
                    <Link href={`/clients/${a.clientId}`} className="font-medium hover:text-brand">{a.clientName}</Link>
                    {a.projectName && a.projectId && (
                      <> · <Link href={`/projects/${a.projectId}`} className="hover:text-brand">{a.projectName}</Link></>
                    )}
                  </p>
                  <p className="text-xs text-fg-secondary mt-1.5">{a.reason}</p>
                  {a.suggestedAction && (
                    <p className="text-xs text-fg mt-1.5 bg-blue-500/[0.06] border border-blue-500/15 rounded-lg px-2.5 py-1.5">
                      💡 {a.suggestedAction}
                    </p>
                  )}
                  {expanded === a.id && (
                    <pre className="text-[10px] text-fg-muted mt-2 bg-surface-muted/50 rounded-lg p-2 overflow-x-auto">
                      {JSON.stringify(a.evidence, null, 2)}
                    </pre>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    {a.status === "OPEN" && (
                      <button onClick={() => setStatus(a.id, "SEEN")}
                        className="text-[10px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors">
                        Vista
                      </button>
                    )}
                    <button onClick={() => setStatus(a.id, "RESOLVED")}
                      className="text-[10px] font-medium px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 transition-colors">
                      Resolver
                    </button>
                    <button onClick={() => setStatus(a.id, "DISMISSED")}
                      className="text-[10px] font-medium px-2 py-1 rounded-md border border-line text-fg-muted hover:bg-surface-hover transition-colors"
                      title="Descartar: el watchdog no la vuelve a levantar por 7 días">
                      Descartar
                    </button>
                  </div>
                  {Object.keys(a.evidence).length > 0 && (
                    <button onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                      className="text-[10px] text-fg-muted hover:text-fg">
                      {expanded === a.id ? "ocultar evidencia" : "evidencia"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
