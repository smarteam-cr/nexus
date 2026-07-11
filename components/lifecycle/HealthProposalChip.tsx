"use client";

/**
 * components/lifecycle/HealthProposalChip.tsx
 *
 * Propuesta "EN RIESGO" pendiente (el watchdog propone por señales duras, el CSE
 * decide): chip rojo con Confirmar (escribe healthStatusOverride=EN_RIESGO) /
 * Descartar. PATCH /api/projects/[id]/health-proposal + refresh.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";

export default function HealthProposalChip({
  projectId,
  reason,
  proposedAt,
}: {
  projectId: string;
  reason: string | null;
  proposedAt: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"confirm" | "dismiss" | null>(null);
  const [resolved, setResolved] = useState(false);
  if (resolved) return null;

  const act = async (action: "confirm" | "dismiss") => {
    setBusy(action);
    try {
      await fetchJson(`/api/projects/${projectId}/health-proposal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setResolved(true);
      toast.success(action === "confirm" ? "Proyecto marcado En riesgo (curado)." : "Propuesta descartada.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo resolver la propuesta.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded border text-red-600 bg-red-500/10 border-red-500/30"
      title={`${reason ?? "Señales duras del cronograma"}${proposedAt ? ` · propuesto el ${new Date(proposedAt).toLocaleDateString("es-CR", { day: "numeric", month: "short" })}` : ""}`}
    >
      En riesgo (propuesto por el agente)
      <button
        onClick={() => act("confirm")}
        disabled={busy !== null}
        className="underline decoration-dotted hover:text-red-700 disabled:opacity-50"
      >
        {busy === "confirm" ? "…" : "Confirmar"}
      </button>
      <button
        onClick={() => act("dismiss")}
        disabled={busy !== null}
        className="text-fg-muted underline decoration-dotted hover:text-fg disabled:opacity-50"
      >
        {busy === "dismiss" ? "…" : "Descartar"}
      </button>
    </span>
  );
}
