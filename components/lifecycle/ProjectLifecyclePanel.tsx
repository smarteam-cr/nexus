"use client";

/**
 * components/lifecycle/ProjectLifecyclePanel.tsx
 *
 * Panel "Ciclo de vida" del workspace del proyecto: etapa efectiva (StageBadge)
 * + selector de override (curación, seeAllClients server-side) + checklist de
 * VALIDACIONES DE SALIDA (gates — marcar mueve la etapa inferida) + modalidad de
 * adopción (sugerida por tamaño de cuenta → el CSE confirma).
 *
 * Self-fetching (GET /api/projects/[id]/lifecycle) → montarlo es una línea.
 */
import { useCallback, useEffect, useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import StageBadge from "./StageBadge";
import {
  FULL_CYCLE_ORDER,
  SHORT_CYCLE_ORDER,
  STAGE_LABEL_ES,
  type LifecycleCycle,
} from "@/lib/lifecycle/stage-engine";

interface LifecycleDTO {
  effective: string;
  inferred: string;
  source: "override" | "inferred";
  label: string;
  position: { index: number; total: number };
  cycle: LifecycleCycle;
  reasons: string[];
  override: { stage: string; reason: string | null; at: string | null; by: string | null } | null;
  gates: Array<{ gate: string; markedAt: string; markedBy: string | null; source: string; note: string | null }>;
  kickoffPublishedAt: string | null;
  kickoffSessionAt: string | null;
  adoptionMode: {
    confirmed: "directa" | "por_pilotos" | null;
    suggested: "directa" | "por_pilotos" | null;
    confirmedAt: string | null;
    confirmedBy: string | null;
  };
  uus: { score: number | null; threshold: number };
}

/** Gates del ciclo full con su copy de checklist (orden = cadena de salida). */
const GATE_META: Array<{ key: string; label: string; hint: string }> = [
  { key: "ENTENDIMIENTO_CERRADO", label: "Entendimiento cerrado", hint: "Sesiones de exploración cumplidas + notas confirmadas" },
  { key: "DIAGNOSTICO_COMPARTIDO", label: "Diagnóstico compartido", hint: "Entregable presentado y compartido con el cliente" },
  { key: "CRONOGRAMA_CONSENSUADO", label: "Cronograma consensuado por el cliente", hint: "El cliente aprobó el cronograma (desde acá aplican las alarmas de atraso)" },
  { key: "DEMO_APROBADA", label: "Demo funcional aprobada", hint: "El cliente aprobó lo construido sobre HubSpot" },
  { key: "CLIENTE_OPERANDO", label: "Cliente operando", hint: "Sesiones de adopción cumplidas y el cliente usa el sistema" },
  { key: "USO_VALIDADO", label: "Uso validado", hint: "Puntaje de usabilidad (UUS) sobre el umbral — el sistema lo marca solo" },
  { key: "ENTREGA_REALIZADA", label: "Entrega realizada", hint: "Sesión de entrega + sugerencia para Ventas (cross-selling)" },
];
const SHORT_CYCLE_GATES = new Set(["ENTREGA_REALIZADA"]);

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short" });

export default function ProjectLifecyclePanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [data, setData] = useState<LifecycleDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [busyGate, setBusyGate] = useState<string | null>(null);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideStage, setOverrideStage] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const reload = useCallback(async () => {
    try {
      setData(await fetchJson<LifecycleDTO>(`/api/projects/${projectId}/lifecycle`));
    } catch {
      // panel opcional: sin datos no rompe el workspace
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    fetchJson<LifecycleDTO>(`/api/projects/${projectId}/lifecycle`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Barra placeholder con la MISMA altura que la barra colapsada real: con `return null`
  // la sección no existía hasta que respondía el fetch y entonces empujaba hacia abajo
  // todo el canvas que tiene debajo.
  if (!data) return <div className="h-[46px] rounded-xl border border-line bg-surface" />;
  const gateByKey = new Map(data.gates.map((g) => [g.gate, g]));
  const cycleGates = data.cycle === "short" ? GATE_META.filter((g) => SHORT_CYCLE_GATES.has(g.key)) : GATE_META;
  const order = data.cycle === "short" ? SHORT_CYCLE_ORDER : FULL_CYCLE_ORDER;

  const toggleGate = async (key: string, marked: boolean) => {
    setBusyGate(key);
    try {
      if (marked) {
        await fetchJson(`/api/projects/${projectId}/stage-gates`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gate: key }),
        });
      } else {
        await fetchJson(`/api/projects/${projectId}/stage-gates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gate: key,
            ...(key === "ENTREGA_REALIZADA" && deliveryNote.trim() ? { note: deliveryNote.trim() } : {}),
          }),
        });
        if (key === "ENTREGA_REALIZADA") setDeliveryNote("");
      }
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar la validación.");
    } finally {
      setBusyGate(null);
    }
  };

  const saveOverride = async (stage: string | null) => {
    try {
      await fetchJson(`/api/projects/${projectId}/lifecycle-stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, reason: overrideReason.trim() || undefined }),
      });
      setOverrideOpen(false);
      setOverrideReason("");
      await reload();
      toast.success(stage ? "Etapa fijada a mano." : "Etapa devuelta a la inferida.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cambiar la etapa.");
    }
  };

  const confirmAdoption = async (mode: "directa" | "por_pilotos" | null) => {
    try {
      await fetchJson(`/api/projects/${projectId}/adoption-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la modalidad.");
    }
  };

  return (
    <div className="bg-surface border border-line rounded-xl">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-fg">Ciclo de vida</span>
        <StageBadge
          stage={data.effective}
          cycle={data.cycle}
          source={data.source}
          reasons={data.reasons}
          overrideReason={data.override?.reason}
        />
        <span className="ml-auto text-fg-muted text-xs">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-line pt-3">
          {/* Por qué está acá */}
          <p className="text-[11px] text-fg-secondary">{data.reasons.join(" · ")}</p>

          {/* Override (curación) */}
          <div className="text-[11px]">
            {data.override ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-fg-muted">
                  Etapa fijada a mano{data.override.by ? ` por ${data.override.by}` : ""}
                  {data.override.reason ? ` — "${data.override.reason}"` : ""}. Inferida:{" "}
                  {STAGE_LABEL_ES[data.inferred as keyof typeof STAGE_LABEL_ES] ?? data.inferred}.
                </span>
                <button onClick={() => saveOverride(null)} className="text-brand hover:underline">
                  Volver a la inferida
                </button>
              </div>
            ) : overrideOpen ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={overrideStage}
                  onChange={(e) => setOverrideStage(e.target.value)}
                  className="bg-surface border border-line rounded px-2 py-1 text-[11px] text-fg"
                >
                  <option value="">Elegí la etapa…</option>
                  {order.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL_ES[s]}
                    </option>
                  ))}
                </select>
                <input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="¿Por qué? (opcional)"
                  className="flex-1 min-w-40 bg-surface border border-line rounded px-2 py-1 text-[11px] text-fg placeholder:text-fg-muted"
                />
                <button
                  onClick={() => overrideStage && saveOverride(overrideStage)}
                  disabled={!overrideStage}
                  className="text-brand hover:underline disabled:opacity-50"
                >
                  Fijar
                </button>
                <button onClick={() => setOverrideOpen(false)} className="text-fg-muted hover:underline">
                  Cancelar
                </button>
              </div>
            ) : (
              <button onClick={() => setOverrideOpen(true)} className="text-fg-muted hover:text-brand hover:underline">
                Corregir etapa a mano…
              </button>
            )}
          </div>

          {/* Checklist de validaciones de salida */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-fg-muted uppercase tracking-wide">
              Validaciones de salida
            </p>
            {/* Salida de HAND_OFF (informativa — la mueve el botón Publicar kickoff) */}
            <div className="flex items-start gap-2 text-[11px]">
              <span className="mt-0.5">{data.kickoffPublishedAt || data.kickoffSessionAt ? "☑" : "☐"}</span>
              <span className={data.kickoffPublishedAt || data.kickoffSessionAt ? "text-fg" : "text-fg-muted"}>
                Kickoff {data.kickoffPublishedAt
                  ? `publicado (${fmtDay(data.kickoffPublishedAt)})`
                  : data.kickoffSessionAt
                    ? `realizado (sesión ${fmtDay(data.kickoffSessionAt)}) — página sin publicar`
                    : "sin publicar"}
                <span className="text-fg-muted"> · lo mueve el botón «Publicar kickoff»</span>
              </span>
            </div>
            {cycleGates.map((g) => {
              const row = gateByKey.get(g.key);
              const marked = !!row;
              return (
                <div key={g.key} className="flex items-start gap-2 text-[11px]">
                  <button
                    onClick={() => toggleGate(g.key, marked)}
                    disabled={busyGate === g.key}
                    className="mt-0.5 hover:text-brand disabled:opacity-50"
                    title={marked ? "Desmarcar (retrocede la etapa inferida)" : "Marcar como cumplida"}
                  >
                    {busyGate === g.key ? "…" : marked ? "☑" : "☐"}
                  </button>
                  <div className={marked ? "text-fg" : "text-fg-muted"}>
                    <span>{g.label}</span>
                    {row && (
                      <span className="text-fg-muted">
                        {" "}
                        · {fmtDay(row.markedAt)}
                        {row.markedBy ? ` · ${row.markedBy}` : row.source === "backfill" ? " · backfill" : row.source === "system" ? " · sistema" : ""}
                      </span>
                    )}
                    <p className="text-[10px] text-fg-muted">{g.hint}</p>
                    {row?.note && <p className="text-[10px] text-fg-secondary mt-0.5">Nota: {row.note}</p>}
                    {g.key === "ENTREGA_REALIZADA" && !marked && (
                      <input
                        value={deliveryNote}
                        onChange={(e) => setDeliveryNote(e.target.value)}
                        placeholder="Sugerencia para Ventas (cross-selling) — se guarda al marcar"
                        className="mt-1 w-full max-w-md bg-surface border border-line rounded px-2 py-1 text-[10px] text-fg placeholder:text-fg-muted"
                      />
                    )}
                    {g.key === "USO_VALIDADO" && !marked && data.uus.score != null && (
                      <p className="text-[10px] text-fg-muted">
                        UUS actual: {data.uus.score} · umbral: {data.uus.threshold}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modalidad de adopción (solo ciclo full) */}
          {data.cycle === "full" && (
            <div className="text-[11px]">
              <p className="text-[10px] font-semibold text-fg-muted uppercase tracking-wide mb-1">
                Modalidad de adopción
              </p>
              {data.adoptionMode.confirmed ? (
                <span className="text-fg">
                  {data.adoptionMode.confirmed === "por_pilotos" ? "Por pilotos" : "Directa"}
                  <span className="text-fg-muted">
                    {" "}
                    · confirmada{data.adoptionMode.confirmedBy ? ` por ${data.adoptionMode.confirmedBy}` : ""}
                  </span>{" "}
                  <button onClick={() => confirmAdoption(null)} className="text-fg-muted hover:underline">
                    (cambiar)
                  </button>
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2 text-fg-secondary">
                  {data.adoptionMode.suggested
                    ? `Sugerida: ${data.adoptionMode.suggested === "por_pilotos" ? "Por pilotos (cuenta grande según HubSpot)" : "Directa (cuenta chica)"} —`
                    : "Sin datos de la cuenta para sugerir —"}
                  <button onClick={() => confirmAdoption("directa")} className="text-brand hover:underline">
                    Directa
                  </button>
                  <button onClick={() => confirmAdoption("por_pilotos")} className="text-brand hover:underline">
                    Por pilotos
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
