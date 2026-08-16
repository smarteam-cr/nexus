"use client";

/**
 * components/projects/ProjectBriefSection.tsx — CÓMO VA ESTE PROYECTO, EN AFIRMACIONES CON FUENTE.
 *
 * Hermano de `components/cs/account/AccountBriefSection.tsx` un nivel más abajo. Dos diferencias
 * que no son de estilo:
 *
 * 1. **El cartel de vencido dice POR QUÉ.** Aquél solo sabe que `staleAt` está puesto; acá la
 *    frescura se DERIVA de los timestamps reales (`lib/projects/brief-vencido.ts`) y el aviso
 *    enumera qué cambió. «Hubo una reunión nueva» y «hubo una reunión nueva y cambió la etapa»
 *    piden reacciones distintas, y un cartel genérico las aplana en la misma.
 *
 * 2. **Se muestra cuántas afirmaciones se descartaron.** Es cuántas citó el modelo apuntando a
 *    una fuente que no existía, y es el único indicador de calidad que este circuito produce: un
 *    número alto significa que el prompt está flojo, no que el proyecto esté tranquilo.
 *    Esconderlo dejaría un resumen corto pareciendo un proyecto sin novedades.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import SourceChip, { fmtChipDate } from "@/components/cs/SourceChip";

/** Rótulo por tipo de fuente, para cuando la fuente no trajo uno propio. */
const ETIQUETA_POR_TIPO: Record<string, string> = {
  sesion: "Reunión",
  handoff: "Handoff",
  hubspot_ops: "Estado en HubSpot",
  etapa: "Etapa",
  desviacion: "Desviación del cronograma",
};

export interface BriefDeProyecto {
  headline: string | null;
  statements: Array<{
    text: string;
    source: { kind: string; id: string; label: string; date: string | null };
  }>;
  generatedAt: string;
  /** Lo resuelve el servidor con `evaluarFrescura`: un solo veredicto, con su motivo. */
  vencido: boolean;
  motivoDeVencimiento: string | null;
}

export default function ProjectBriefSection({
  projectId,
  brief,
}: {
  projectId: string;
  brief: BriefDeProyecto | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [generando, setGenerando] = useState(false);

  async function generar() {
    setGenerando(true);
    toast.info("Leyendo el material del proyecto… (~30 segundos)");
    try {
      const r = await fetchJson<{ statements: number; discarded: number }>(
        `/api/projects/${projectId}/brief`,
        { method: "POST" },
      );
      /* El descarte se anuncia cuando es ALTO en proporción. Decirlo siempre sería ruido; no
         decirlo nunca escondería que el resumen salió corto porque el modelo citó mal. */
      const total = r.statements + r.discarded;
      if (r.discarded > 0 && r.discarded >= total / 3) {
        toast.info(
          `Resumen generado con ${r.statements} afirmaciones. Se descartaron ${r.discarded} por ` +
            `citar una fuente que no existe — si se repite, el prompt del agente necesita ajuste.`,
        );
      } else {
        toast.success(`Resumen generado con ${r.statements} afirmaciones.`);
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo generar el resumen.");
    } finally {
      setGenerando(false);
    }
  }

  if (!brief) {
    return (
      <div className="px-4 py-3 border-b border-line">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-fg-muted">
            Todavía no hay resumen de este proyecto. El agente lo redacta desde las reuniones, el
            estado en HubSpot y las desviaciones del cronograma, citando cada afirmación.
          </p>
          <button
            onClick={generar}
            disabled={generando}
            className="text-xs font-medium px-3 py-1.5 rounded-md bg-brand text-primary-fg hover:bg-brand/90 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {generando ? "Generando…" : "✨ Generar resumen"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-line space-y-3">
      {brief.vencido && (
        <div className="flex items-start gap-2 text-[11px] border border-warn-line bg-warn-surface text-warn-ink rounded-lg px-3 py-2">
          {/* El motivo, no un «quedó viejo» genérico: es lo que dice si hace falta regenerar ya
              o si puede esperar. */}
          <span className="flex-1">{brief.motivoDeVencimiento}</span>
          <button
            onClick={generar}
            disabled={generando}
            className="font-medium underline decoration-dotted hover:text-fg disabled:opacity-50 whitespace-nowrap"
          >
            {generando ? "Regenerando…" : "↻ Regenerar"}
          </button>
        </div>
      )}
      {brief.headline && (
        <p className="text-sm font-semibold text-fg leading-snug">{brief.headline}</p>
      )}
      <ul className="space-y-2">
        {brief.statements.map((s, i) => (
          <li key={i} className="text-xs text-fg-secondary leading-relaxed">
            <span>{s.text} </span>
            <SourceChip
              label={s.source.label || ETIQUETA_POR_TIPO[s.source.kind] || s.source.kind}
              date={s.source.date}
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-fg-muted">
          Generado {fmtChipDate(brief.generatedAt)}
        </span>
        {!brief.vencido && (
          <button
            onClick={generar}
            disabled={generando}
            className="text-[10px] text-brand hover:text-brand/80 disabled:opacity-50"
          >
            {generando ? "Regenerando…" : "↻ Regenerar"}
          </button>
        )}
      </div>
    </div>
  );
}
