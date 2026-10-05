"use client";

/**
 * components/cs/account/AccountBriefSection.tsx
 *
 * Resumen ejecutivo CITADO de la cuenta (agente agent-cs-account-brief): cada afirmación lleva su
 * SourceChip con fuente y fecha («Minuta kickoff · 2 jul», «HubSpot Partner · hoy»). Aviso de
 * «desactualizado» cuando el sync marcó staleAt. La generación es on-demand
 * (POST /api/cs/account-brief/[clientId]).
 *
 * Rediseño 2026-10-04: recuadro azul con la chispa de IA (lo escribió el agente) y los botones del
 * sistema. El botón azul sólido de la ficha es el de «Qué sigue»: este es blanco.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { BotonBlanco, BotonTexto, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
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
  alerta: "Alerta del agente vigía",
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
    toast.info("Redactando el resumen de la cuenta… (unos 30 segundos)");
    try {
      await fetchJson(`/api/cs/account-brief/${clientId}`, { method: "POST" });
      toast.success("Resumen listo.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo redactar el resumen.");
    } finally {
      setGenerating(false);
    }
  }

  if (!brief) {
    return (
      <div data-recorrido="cs.resumen" className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-4 py-3.5">
        <IconoDeSugerencia className="h-[15px] w-[15px] flex-shrink-0 text-brand" />
        <p className="min-w-0 flex-1 text-[13px] text-fg-muted">
          Todavía no hay resumen de la cuenta. El agente lo redacta con las minutas, el cronograma, HubSpot y las alertas, y cita cada frase.
        </p>
        <BotonBlanco onClick={generate} disabled={generating}>
          {generating ? "Redactando…" : "Redactar el resumen"}
        </BotonBlanco>
      </div>
    );
  }

  return (
    <div data-recorrido="cs.resumen" className="flex items-start gap-2.5 rounded-xl border border-info-line bg-info-surface px-4 py-3.5">
      <IconoDeSugerencia className="mt-[3px] h-[15px] w-[15px] flex-shrink-0 text-brand" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className={cn(ROTULO_DEL_SISTEMA, "text-brand")}>Resumen del agente</span>
        {brief.staleAt && (
          <span className="text-xs text-warn-ink">Los datos de la cuenta cambiaron desde que se redactó ({fmtChipDate(brief.staleAt)}).</span>
        )}
        {brief.headline && <p className="text-sm font-semibold leading-snug text-fg">{brief.headline}</p>}
        <ul className="space-y-1.5">
          {brief.statements.map((s, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-fg-secondary">
              <span>{s.text} </span>
              <SourceChip label={s.source.label || SOURCE_KIND_LABEL[s.source.kind] || s.source.kind} date={s.source.date} />
            </li>
          ))}
        </ul>
        <span className="flex items-center gap-2 text-xs text-fg-muted">
          Redactado {fmtChipDate(brief.generatedAt)}
          <BotonTexto onClick={generate} disabled={generating} className="text-brand hover:text-brand-light">
            {generating ? "Redactando…" : "Volver a redactar"}
          </BotonTexto>
        </span>
      </div>
    </div>
  );
}
