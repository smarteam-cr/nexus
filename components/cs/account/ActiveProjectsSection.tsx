"use client";

/**
 * components/cs/account/ActiveProjectsSection.tsx
 *
 * Proyectos activos de la cuenta: salud resuelta + avance del cronograma
 * (ProjectSummary determinístico) + operativa de HubSpot (etapa, prioridad,
 * status, bloqueo con razón y detalle, adopción). Cada mitad con su fuente.
 */
import Link from "next/link";
import SourceChip from "@/components/cs/SourceChip";
import StageBadge from "@/components/lifecycle/StageBadge";
import HealthProposalChip from "@/components/lifecycle/HealthProposalChip";
import RecurrenteBadge from "@/components/lifecycle/RecurrenteBadge";
import { PRIORITY_META, HS_STATUS_LABEL } from "@/components/cs/dashboard/chart-theme";
import type { PortfolioRow } from "@/lib/portfolio/load";
import type { AccountProjectOps } from "@/lib/cs/load-account";

const HEALTH_META: Record<string, { label: string; cls: string }> = {
  SALUDABLE: { label: "Saludable", cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/25" },
  EN_FRICCION: { label: "En fricción", cls: "text-amber-600 bg-amber-500/10 border-amber-500/30" },
  EN_RIESGO: { label: "En riesgo", cls: "text-red-600 bg-red-500/10 border-red-500/30" },
  PAUSADO: { label: "Pausado", cls: "text-fg-muted bg-surface-muted border-line" },
};

export default function ActiveProjectsSection({
  projects,
  projectOps,
}: {
  projects: PortfolioRow[];
  projectOps: Record<string, AccountProjectOps>;
}) {
  if (projects.length === 0) {
    return <p className="text-xs text-fg-muted">Sin proyectos activos en Nexus para esta cuenta.</p>;
  }
  return (
    <div className="space-y-3">
      {projects.map((p) => {
        const ops = projectOps[p.projectId];
        const health = HEALTH_META[p.summary.health.resolved] ?? HEALTH_META.SALUDABLE;
        const prio = ops?.hubspotPriority ? PRIORITY_META[ops.hubspotPriority] : null;
        const blocked = ops?.hubspotStatus === "blocked" || /bloquead/i.test(p.stageLabel ?? "");
        const pct = Math.round(p.summary.progress.pct * 100);
        return (
          <div key={p.projectId} className="bg-surface border border-line rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/clients/${p.clientId}?tab=${p.projectId}`} className="text-sm font-semibold text-fg hover:text-brand">
                {p.projectName}
              </Link>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${health.cls}`}>{health.label}</span>
              {p.summary.health.source === "override" && (
                <span className="text-[9px] text-fg-muted uppercase tracking-wide" title={p.healthOverrideReason ?? undefined}>curada</span>
              )}
              {/* Ciclo de vida: solo con handoff generado. Sin él → aviso, sin etapa. */}
              {p.lifecycle?.defined && p.summary.stage ? (
                <StageBadge
                  stage={p.summary.stage.effective}
                  cycle={p.lifecycle.cycle}
                  source={p.summary.stage.source}
                  reasons={p.lifecycle.reasons}
                  overrideReason={p.lifecycle.override?.reason}
                />
              ) : (
                <Link
                  href={`/clients/${p.clientId}?tab=${p.projectId}`}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-amber-600 bg-amber-500/10 border-amber-500/30"
                  title="Generá el handoff para activar el ciclo de vida (etapas + recurrencia)."
                >
                  Handoff sin generar
                </Link>
              )}
              <RecurrenteBadge recurrent={!!p.lifecycle?.recurrent} />
              {p.healthProposed && (
                <HealthProposalChip
                  projectId={p.projectId}
                  reason={p.healthProposedReason}
                  proposedAt={p.healthProposedAt}
                />
              )}
              {prio && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line" style={{ color: prio.color }}>
                  Prioridad {prio.label}
                </span>
              )}
              {ops?.hubspotStatus && (
                <span className="text-[10px] text-fg-muted px-1.5 py-0.5 rounded border border-line">
                  {HS_STATUS_LABEL[ops.hubspotStatus] ?? ops.hubspotStatus}
                </span>
              )}
              <span className="ml-auto flex items-center gap-1.5">
                {p.stageLabel && <SourceChip label={`HubSpot · ${p.stageLabel}`} />}
                {p.cseName && <span className="text-[11px] text-fg-muted">CSE: {p.cseName}</span>}
              </span>
            </div>

            {/* Cronograma (fuente: Nexus) */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-secondary">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-24 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </span>
                {pct}% · {p.summary.progress.tasksDone}/{p.summary.progress.tasksTotal} tareas
              </span>
              {/* Alarmas de cronograma SOLO cuando aplican (etapa >= configuración técnica);
                  antes, el cronograma es tentativo y lo que se muestra son las alarmas de etapa. */}
              {p.summary.scheduleAlarmsActive ? (
                <>
                  {p.summary.overduePhases > 0 && (
                    <span className="text-red-600">
                      {p.summary.overduePhases} fase{p.summary.overduePhases !== 1 ? "s" : ""} vencida{p.summary.overduePhases !== 1 ? "s" : ""}
                      {p.summary.worstOverduePhase ? ` (${p.summary.worstOverduePhase.name}, ${p.summary.worstOverduePhase.daysLate}d)` : ""}
                    </span>
                  )}
                  {p.summary.overdueTasks > 0 && <span className="text-amber-600">{p.summary.overdueTasks} tareas vencidas</span>}
                  {p.summary.stalled && <span className="text-amber-600">sin actividad {p.summary.daysSinceActivity}d</span>}
                </>
              ) : p.lifecycle?.defined ? (
                // Con handoff pero etapa temprana: el cronograma aún no es promesa.
                <span className="text-fg-muted">cronograma tentativo (sin consensuar)</span>
              ) : null /* sin handoff → el badge "Handoff sin generar" ya lo comunica */}
              {p.summary.stageAlarms.map((a) => (
                <span key={a.key} className="text-amber-600">{a.label}</span>
              ))}
              {p.summary.scope.exceeded && !p.summary.scope.attenuated && (
                <span className="text-purple-600">
                  alcance +{p.summary.scope.addedTasks} tareas{p.summary.scope.weeksDelta > 0 ? ` / +${p.summary.scope.weeksDelta} sem` : ""}
                </span>
              )}
              <SourceChip label={p.summary.hasBaseline ? "Cronograma · baseline" : "Cronograma · sin baseline"} />
              {ops?.hubspotAdoptionState && (
                <span className="inline-flex items-center gap-1">
                  Adopción: <strong className="text-fg">{ops.hubspotAdoptionState}</strong>
                  <SourceChip label="HubSpot" />
                </span>
              )}
            </div>

            {/* Bloqueo (fuente: HubSpot) */}
            {(blocked || ops?.hubspotBlockReason) && (
              <div className="mt-2.5 text-[11px] bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
                <span className="font-medium text-orange-600">
                  {blocked ? "⛔ Bloqueado" : "⚠ Con motivo de bloqueo"}
                  {ops?.hubspotBlockReason ? `: ${ops.hubspotBlockReason}` : ""}
                </span>
                {ops?.hubspotBlockDetail && <p className="text-fg-secondary mt-1">{ops.hubspotBlockDetail}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
