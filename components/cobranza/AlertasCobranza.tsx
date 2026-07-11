"use client";

/**
 * components/cobranza/AlertasCobranza.tsx
 *
 * Feed de alertas de cobranza — clon adaptado de components/cs/AlertsFeed.tsx.
 * Acciones Vista/Resolver/Descartar optimistas con revert POR ALERTA (no
 * snapshot del array: dos PATCH en vuelo no se pisan); filtros por urgencia y
 * estado; evidencia expandible. El estado vive en CobranzaClient (badge del tab).
 */
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { AlertaDTO } from "@/lib/cobranza";
import { TIPO_ALERTA_LABEL } from "@/lib/cobranza/schema";
import { FILTER_SELECT_CLS, fmtFecha, INPUT_CLS } from "./format";

const URG_META: Record<string, { label: string; chip: string; dot: string; border: string }> = {
  ALTA: {
    label: "Alta",
    chip: "text-red-600 bg-red-500/10 border-red-500/30",
    dot: "bg-red-500",
    border: "#ef4444",
  },
  MEDIA: {
    label: "Media",
    chip: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    dot: "bg-amber-500",
    border: "#f59e0b",
  },
  BAJA: {
    label: "Baja",
    chip: "text-sky-600 bg-sky-500/10 border-sky-500/30",
    dot: "bg-sky-500",
    border: "#0ea5e9",
  },
};

function relTime(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  return `hace ${d} días`;
}

function tieneEvidencia(evidencia: unknown): evidencia is Record<string, unknown> {
  return !!evidencia && typeof evidencia === "object" && Object.keys(evidencia).length > 0;
}

export default function AlertasCobranza({
  alertas,
  setAlertas,
}: {
  alertas: AlertaDTO[];
  setAlertas: Dispatch<SetStateAction<AlertaDTO[]>>;
}) {
  const toast = useToast();
  const [urgFilter, setUrgFilter] = useState<string>("all");
  const [estadoFilter, setEstadoFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null); // alerta con date-picker abierto

  const vigentes = useMemo(
    () => alertas.filter((a) => a.estado === "ABIERTA" || a.estado === "VISTA"),
    [alertas],
  );

  const visible = useMemo(() => {
    let list = vigentes;
    if (urgFilter !== "all") list = list.filter((a) => a.urgencia === urgFilter);
    if (estadoFilter !== "all") list = list.filter((a) => a.estado === estadoFilter);
    return list;
  }, [vigentes, urgFilter, estadoFilter]);

  async function setEstado(id: string, estado: "VISTA" | "RESUELTA" | "DESCARTADA") {
    const prevEstado = alertas.find((a) => a.id === id)?.estado;
    setAlertas((as) => as.map((a) => (a.id === id ? { ...a, estado } : a)));
    try {
      await fetchJson(`/api/cobranza/alertas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
    } catch (e) {
      if (prevEstado) {
        setAlertas((as) => as.map((a) => (a.id === id ? { ...a, estado: prevEstado } : a)));
      }
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar la alerta.");
    }
  }

  // Snooze: la alerta sale del feed YA (optimista) y vuelve sola cuando la fecha
  // llega (filtro server-side en loadAlertas) — el estado NO cambia.
  async function posponer(a: AlertaDTO, hastaISO: string) {
    setSnoozeFor(null);
    setAlertas((as) => as.filter((x) => x.id !== a.id));
    try {
      await fetchJson(`/api/cobranza/alertas/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posponerHasta: hastaISO }),
      });
      toast.success(`Alerta pospuesta hasta ${fmtFecha(hastaISO)} — vuelve sola, sin cambiar de estado.`);
    } catch (e) {
      setAlertas((as) => [a, ...as]);
      toast.error(e instanceof ApiError ? e.message : "No se pudo posponer la alerta.");
    }
  }

  if (vigentes.length === 0) {
    return (
      <p className="text-sm text-emerald-600 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
        ✅ Sin alertas de cobranza — nada pendiente de tu atención.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={urgFilter} onChange={(e) => setUrgFilter(e.target.value)} className={FILTER_SELECT_CLS}>
          <option value="all">Toda urgencia</option>
          <option value="ALTA">Alta</option>
          <option value="MEDIA">Media</option>
          <option value="BAJA">Baja</option>
        </select>
        <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} className={FILTER_SELECT_CLS}>
          <option value="all">Abiertas y vistas</option>
          <option value="ABIERTA">Solo abiertas</option>
          <option value="VISTA">Solo vistas</option>
        </select>
        <span className="text-[11px] text-fg-muted">
          {visible.length} vigente{visible.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-2">
        {visible.map((a) => {
          const urg = URG_META[a.urgencia] ?? URG_META.BAJA;
          const isNew = a.estado === "ABIERTA";
          return (
            <div
              key={a.id}
              className={`bg-surface border rounded-xl px-4 py-3 ${isNew ? "border-l-4" : "border-line"}`}
              style={isNew ? { borderLeftColor: urg.border } : undefined}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${urg.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${urg.chip}`}>
                      {urg.label}
                    </span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-muted">
                      {TIPO_ALERTA_LABEL[a.tipo] ?? a.tipo}
                    </span>
                    {a.occurrences > 1 && (
                      <span className="text-[10px] text-fg-muted">detectada ×{a.occurrences}</span>
                    )}
                    <span className="text-[10px] text-fg-muted">· {relTime(a.lastDetectedAt)}</span>
                    {a.estado === "VISTA" && <span className="text-[10px] text-fg-muted">· vista</span>}
                  </div>
                  <p className="text-sm font-semibold text-fg mt-1">{a.clienteNombre}</p>
                  <p className="text-xs text-fg-secondary mt-0.5">{a.mensaje}</p>
                  {expanded === a.id && tieneEvidencia(a.evidencia) && (
                    <pre className="text-[10px] text-fg-muted mt-2 bg-surface-muted/50 rounded-lg p-2 overflow-x-auto">
                      {JSON.stringify(a.evidencia, null, 2)}
                    </pre>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    {a.estado === "ABIERTA" && (
                      <button
                        onClick={() => setEstado(a.id, "VISTA")}
                        className="text-[10px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors"
                      >
                        Vista
                      </button>
                    )}
                    <button
                      onClick={() => setEstado(a.id, "RESUELTA")}
                      className="text-[10px] font-medium px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                    >
                      Resolver
                    </button>
                    <button
                      onClick={() => setEstado(a.id, "DESCARTADA")}
                      className="text-[10px] font-medium px-2 py-1 rounded-md border border-line text-fg-muted hover:bg-surface-hover transition-colors"
                      title="Descartar: sale del feed sin marcarse como resuelta"
                    >
                      Descartar
                    </button>
                    <select
                      value=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        if (v === "fecha") setSnoozeFor(snoozeFor === a.id ? null : a.id);
                        else
                          posponer(
                            a,
                            new Date(Date.now() + Number(v) * 86_400_000).toISOString().slice(0, 10),
                          );
                      }}
                      title="Posponer: sale del feed y vuelve sola en la fecha — no cambia el estado"
                      className="text-[10px] font-medium px-1 py-1 rounded-md border border-line text-fg-secondary bg-surface hover:bg-surface-hover transition-colors"
                    >
                      <option value="">Posponer…</option>
                      <option value="3">3 días</option>
                      <option value="7">7 días</option>
                      <option value="14">14 días</option>
                      <option value="fecha">Elegir fecha…</option>
                    </select>
                  </div>
                  {snoozeFor === a.id && (
                    <input
                      type="date"
                      autoFocus
                      onChange={(e) => {
                        if (e.target.value) posponer(a, e.target.value);
                      }}
                      className={`${INPUT_CLS} !w-auto text-[10px]`}
                    />
                  )}
                  {tieneEvidencia(a.evidencia) && (
                    <button
                      onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                      className="text-[10px] text-fg-muted hover:text-fg"
                    >
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
