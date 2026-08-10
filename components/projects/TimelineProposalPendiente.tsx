"use client";

import { useMe } from "@/hooks/useMe";

/**
 * components/projects/TimelineProposalPendiente.tsx — EL CARTEL de la propuesta de
 * cronograma que quedó sin revisar.
 *
 * ── POR QUÉ EXISTE (Tanda M, 2026-08-10) ─────────────────────────────────────
 * Cuando el handoff se regenera sobre un proyecto que YA tiene cronograma, las fases
 * nuevas NUNCA se pisan directo — quedan como `ProjectTimeline.pendingProposal`,
 * esperando que el CSE las revise ("Revisar N cambios"). Hasta ahora ese aviso vivía
 * enterrado en la pestaña Cronograma, detrás del permiso de edición: "el handoff se
 * regeneró bien" y "el cronograma tiene cambios sin mirar" podían coexistir sin que
 * nadie se enterara salvo que abriera esa pestaña por casualidad.
 *
 * ── EN DOS LUGARES, A PROPÓSITO — mismo criterio que AltaTrabada.tsx ────────────
 * El rail de la ficha del cliente y el widget del proyecto. El del rail es el que
 * importa: el widget vive DENTRO de un proyecto ya abierto.
 *
 * Sin lógica de mutex compartida (a diferencia de AltaTrabada): esto es un aviso de
 * SOLO LECTURA, no dispara ninguna escritura — no hay carrera que evitar entre las
 * dos instancias.
 */

export interface TimelineProposalPendienteProps {
  projectId: string;
  clientId: string;
  /** `ProjectTimeline.pendingProposal != null`. Si no hay propuesta, no pinta nada. */
  pending: boolean;
  /** `compacto` en el rail (una línea); `completo` en el widget del proyecto. */
  variante?: "compacto" | "completo";
}

export default function TimelineProposalPendiente({
  projectId,
  clientId,
  pending,
  variante = "completo",
}: TimelineProposalPendienteProps) {
  const me = useMe();
  // Misma capability que ya gatea "Revisar N cambios" dentro de CronogramaCanvas — un
  // solo criterio de permiso, no dos que puedan divergir.
  const puedeRevisar = me?.capabilities.includes("editTimeline") ?? false;

  if (!pending) return null;

  const href = `/clients/${clientId}?tab=${encodeURIComponent(projectId)}#cronograma-gantt`;
  const boton = puedeRevisar ? (
    <a
      href={href}
      className="flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded-lg border border-warn-line text-warn-ink hover:bg-warn-line/20 transition-colors"
    >
      Revisar
    </a>
  ) : null;

  if (variante === "compacto") {
    return (
      <div className="px-6 py-2 flex items-center gap-2 flex-wrap border-b border-warn-line bg-warn-surface">
        <span className="text-xs font-medium text-warn-ink">
          El cronograma tiene una propuesta sin revisar
        </span>
        <span className="text-xs text-warn-ink/70">
          · el handoff sugirió cambios de fases que todavía no se aplicaron
        </span>
        <span className="ml-auto" />
        {boton}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-warn-line bg-warn-surface p-4 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-warn-ink">El cronograma tiene una propuesta sin revisar</p>
        <p className="mt-1 text-xs text-warn-ink/80 leading-relaxed">
          El handoff propuso cambios de fases al regenerarse — el cronograma sigue como estaba
          hasta que alguien los revise y los acepte (o los descarte).
        </p>
      </div>
      {boton}
    </div>
  );
}
