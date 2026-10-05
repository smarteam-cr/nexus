"use client";

/**
 * components/cs/account/ActiveProjectsSection.tsx
 *
 * Proyectos activos de la cuenta, como filas de una tabla (rediseño 2026-10-04): etapa, salud, qué
 * pasa (bloqueo de HubSpot, atraso del cronograma, alarmas de etapa), el cierre prometido contra el
 * proyectado, el CSE y el avance. Dentro de «Qué pasa» viven los dos chips que resuelven cosas:
 * la propuesta de salud del agente vigía y el estado sugerido por el motivo de bloqueo.
 */
import Link from "next/link";
import HealthProposalChip from "@/components/lifecycle/HealthProposalChip";
import EstadoSugeridoChip from "./EstadoSugeridoChip";
import type { PortfolioRow } from "@/lib/portfolio/load";
// PURO y client-safe a propósito: `lib/portfolio/load.ts` importa Prisma, así que de ahí
// solo puede venir el TIPO (que se borra en compilación), nunca una función.
import { etapaParaLaUI } from "@/lib/lifecycle/etapa-ui";
import { HS_STATUS_LABEL } from "@/components/cs/dashboard/chart-theme";
import type { AccountProjectOps } from "@/lib/cs/load-account";
import { cn } from "@/lib/cn";
import { fmtDia } from "@/lib/cs/formato";
import { Avatar, Barra, CajaDeTabla, Chip, EncabezadoDeTabla, Flecha, Punto, type ColorDePunto } from "../piezas";

const SALUD: Record<string, { texto: string; color: ColorDePunto }> = {
  SALUDABLE: { texto: "Saludable", color: "verde" },
  EN_FRICCION: { texto: "En fricción", color: "ambar" },
  EN_RIESGO: { texto: "En riesgo", color: "rojo" },
  PAUSADO: { texto: "Pausado", color: "gris" },
};

const COLUMNAS = "grid-cols-[minmax(0,1.3fr)_112px_minmax(0,1.7fr)_170px_120px_30px_16px]";

export default function ActiveProjectsSection({
  projects,
  projectOps,
  csePorProyecto,
  puedeCurar,
}: {
  projects: PortfolioRow[];
  projectOps: Record<string, AccountProjectOps>;
  /**
   * El CSE que vale para Éxito del cliente (`cseVigente`, lib/cs/cartera.ts): quien está de baja en
   * Nexus no cuenta como CSE aunque HubSpot lo siga teniendo como dueño.
   */
  csePorProyecto: Record<string, { nombre: string | null; deBaja: string | null }>;
  /**
   * ⚠ Si puede RESOLVER la propuesta de salud del watchdog (`clientes.viewAll`). Con `false` el
   * chip se sigue viendo —es información útil— pero sin Confirmar/Descartar, que darían 403.
   */
  puedeCurar: boolean;
}) {
  if (projects.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-5 text-[13px] text-fg-muted">
        Sin proyectos activos en Nexus para esta cuenta.
      </p>
    );
  }
  return (
    <CajaDeTabla minimo="min-w-[900px]">
      <EncabezadoDeTabla columnas={COLUMNAS}>
        <span>Proyecto</span>
        <span>Salud</span>
        <span>Qué pasa</span>
        <span>Cierre</span>
        <span>Avance</span>
        <span>CSE</span>
        <span />
      </EncabezadoDeTabla>
      {projects.map((p, i) => {
        const ops = projectOps[p.projectId];
        const s = p.summary;
        const salud = SALUD[s.health.resolved] ?? SALUD.SALUDABLE;
        const bloqueado = ops?.hubspotStatus === "blocked" || /bloquead/i.test(p.stageLabel ?? "");
        const etapa = etapaParaLaUI(p.lifecycle);
        const pct = Math.round(s.progress.pct * 100);
        const atrasado = s.scheduleAlarmsActive && (s.overduePhases > 0 || s.overdueTasks > 0);
        const href = `/clients/${p.clientId}?tab=${p.projectId}`;
        return (
          <div key={p.projectId} className={cn("grid items-center gap-4 px-4 py-3.5 text-fg", COLUMNAS, i > 0 && "border-t border-line")}>
            <span className="flex min-w-0 flex-col gap-0.5">
              <Link href={href} className="truncate text-sm font-semibold hover:text-brand">
                {p.projectName}
              </Link>
              <span className="truncate text-xs text-fg-muted">{etapa?.label ?? p.stageLabel ?? "Handoff sin generar"}</span>
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="inline-flex items-center gap-1.5 text-[13px]">
                <Punto color={bloqueado ? "rojo" : salud.color} />
                {bloqueado ? "Bloqueado" : salud.texto}
              </span>
              {s.health.source === "override" && (
                <span className="text-[11px] text-fg-muted" title={p.healthOverrideReason ?? undefined}>
                  fijada a mano
                </span>
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[13px]">
                {bloqueado && ops?.hubspotBlockReason
                  ? `Bloqueado: ${ops.hubspotBlockReason.toLowerCase()}`
                  : atrasado
                    ? s.worstOverduePhase
                      ? `«${s.worstOverduePhase.name}» va ${s.worstOverduePhase.daysLate} días tarde`
                      : `${s.overdueTasks} tareas vencidas`
                    : s.stageAlarms.length > 0
                      ? s.stageAlarms.map((a) => a.label).join(" · ")
                      : s.scheduleAlarmsActive
                        ? "Al día."
                        : "Cronograma sin línea base: las fechas todavía son tentativas."}
              </span>
              {ops?.hubspotBlockDetail && <span className="line-clamp-2 text-xs text-fg-muted">{ops.hubspotBlockDetail}</span>}
              <span className="flex flex-wrap gap-1.5">
                {p.healthProposed && (
                  <HealthProposalChip projectId={p.projectId} reason={p.healthProposedReason} proposedAt={p.healthProposedAt} puedeResolver={puedeCurar} />
                )}
                {/* El estado que dice HubSpot, y JUNTO a él el chip que avisa si el motivo cargado lo
                    contradice: separarlos obligaría a acordarse de qué decía el otro. */}
                {ops?.hubspotStatus && <Chip>HubSpot: {HS_STATUS_LABEL[ops.hubspotStatus] ?? ops.hubspotStatus}</Chip>}
                <EstadoSugeridoChip projectId={p.projectId} estadoActual={ops?.hubspotStatus ?? null} motivo={ops?.hubspotBlockReason ?? null} />
              </span>
            </span>
            <span className="flex flex-col gap-0.5 text-[13px]">
              {s.closing.promisedISO ? <span>Prometido {fmtDia(s.closing.promisedISO)}</span> : <span className="text-fg-muted">sin promesa</span>}
              {s.closing.projectedISO && s.closing.driftDays !== null && s.closing.driftDays > 0 ? (
                <span className="text-xs text-warn-ink">
                  Ahora {fmtDia(s.closing.projectedISO)} · +{Math.round(s.closing.driftDays / 7)} sem
                </span>
              ) : s.closing.projectedISO ? (
                <span className="text-xs text-fg-muted">Proyectado {fmtDia(s.closing.projectedISO)}</span>
              ) : null}
            </span>
            <span className="flex items-center gap-2 text-[13px]">
              <Barra valor={pct} ancho="w-14" />
              <span className="tabular-nums">{pct} %</span>
            </span>
            {(() => {
              const vigente = csePorProyecto[p.projectId];
              const nombre = vigente ? vigente.nombre : p.cseName;
              return <Avatar nombre={nombre} title={vigente?.deBaja ? `Sin CSE: ${vigente.deBaja} ya no está en el equipo` : undefined} />;
            })()}
            <Link href={href} aria-label={`Abrir ${p.projectName}`}>
              <Flecha />
            </Link>
          </div>
        );
      })}
    </CajaDeTabla>
  );
}
