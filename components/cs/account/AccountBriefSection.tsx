"use client";

/**
 * components/cs/account/AccountBriefSection.tsx
 *
 * Resumen ejecutivo CITADO de la cuenta (agente agent-cs-account-brief): cada
 * afirmación lleva su SourceChip con fuente+fecha ("Minuta kickoff · 2 jul",
 * "HubSpot Partner · hoy"). Banner "desactualizado" cuando el sync marcó staleAt.
 * La generación es on-demand (POST /api/cs/account-brief/[clientId]).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import SourceChip, { fmtChipDate } from "@/components/cs/SourceChip";
import type { CsAccountData } from "@/lib/cs/load-account";

const SOURCE_KIND_LABEL: Record<string, string> = {
  hubspot_partner: "HubSpot Partner",
  hubspot_signals: "HubSpot",
  cronograma: "Cronograma",
  minuta: "Minuta",
  handoff: "Handoff",
  kickoff: "Kickoff",
  propuesta: "Propuesta",
  alerta: "Alerta watchdog",
};

export default function AccountBriefSection({
  clientId,
  brief,
}: {
  clientId: string;
  brief: CsAccountData["brief"];
}) {
  const toast = useToast();
  const router = useRouter();
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    toast.info("Generando el resumen de la cuenta… (~30 segundos)");
    try {
      await fetchJson(`/api/cs/account-brief/${clientId}`, { method: "POST" });
      toast.success("Resumen generado.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo generar el resumen.");
    } finally {
      setGenerating(false);
    }
  }

  if (!brief) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-fg-muted mb-3">
          Todavía no hay resumen ejecutivo de esta cuenta. El agente lo redacta desde el contexto
          disponible (minutas, cronograma, HubSpot, alertas) citando cada afirmación con su fuente.
        </p>
        <button
          onClick={generate}
          disabled={generating}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
        >
          {generating ? "Generando…" : "✨ Generar resumen"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {brief.staleAt && (
        <div className="flex items-center gap-2 text-[11px] text-amber-600 bg-amber-500/5 border border-amber-500/25 rounded-lg px-3 py-2">
          <span className="flex-1">
            Los datos de la cuenta cambiaron desde que se generó este resumen ({fmtChipDate(brief.staleAt)}).
          </span>
          <button
            onClick={generate}
            disabled={generating}
            className="font-medium text-brand hover:text-brand/80 disabled:opacity-50 whitespace-nowrap"
          >
            {generating ? "Regenerando…" : "↻ Regenerar"}
          </button>
        </div>
      )}
      {brief.headline && <p className="text-sm font-semibold text-fg leading-snug">{brief.headline}</p>}
      <ul className="space-y-2">
        {brief.statements.map((s, i) => (
          <li key={i} className="text-xs text-fg-secondary leading-relaxed">
            <span>{s.text} </span>
            <SourceChip
              label={s.source.label || SOURCE_KIND_LABEL[s.source.kind] || s.source.kind}
              date={s.source.date}
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[10px] text-fg-muted">Generado {fmtChipDate(brief.generatedAt)}</span>
        {!brief.staleAt && (
          <button onClick={generate} disabled={generating} className="text-[10px] text-brand hover:text-brand/80 disabled:opacity-50">
            {generating ? "Regenerando…" : "↻ Regenerar"}
          </button>
        )}
      </div>
    </div>
  );
}
