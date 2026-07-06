"use client";

/**
 * components/cs/dashboard/CsDashboard.tsx
 *
 * Orquestador del dashboard visual de Customer Success — reemplaza los
 * dashboards manuales de HubSpot de la CSL: KPIs con fuente, carga por CSE
 * (prioridad), etapas del pipeline, razones de bloqueo con detalle, adopción
 * por proyecto y uso por cuenta (Partner). Cada card lleva su SourceChip.
 */
import type { ReactNode } from "react";
import SourceChip from "@/components/cs/SourceChip";
import KpiCards from "./KpiCards";
import LoadByCseChart from "./LoadByCseChart";
import PipelineStageChart from "./PipelineStageChart";
import BlockReasonsChart from "./BlockReasonsChart";
import AdoptionSection from "./AdoptionSection";
import type { CsDashboardData } from "@/lib/cs/load-dashboard";

function DashCard({
  title,
  source,
  children,
  className = "",
}: {
  title: string;
  source?: { label: string; date?: string | null; missing?: boolean };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-surface border border-line rounded-xl p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {source && <SourceChip label={source.label} date={source.date} tone={source.missing ? "missing" : "ok"} />}
      </div>
      {children}
    </section>
  );
}

export default function CsDashboard({ data }: { data: CsDashboardData }) {
  const hs = { label: "HubSpot", date: data.freshness.stageSyncedAt };
  return (
    <div className="space-y-4 mb-8">
      <KpiCards counters={data.counters} freshness={data.freshness} partnerVisible={data.partnerVisible} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="Carga de proyectos por CSE" source={hs}>
          <LoadByCseChart byCse={data.byCse} />
        </DashCard>
        <DashCard title="Proyectos por etapa del pipeline" source={hs}>
          <PipelineStageChart byStage={data.byStage} />
        </DashCard>
        <DashCard title="Razones de bloqueo y atraso" source={hs}>
          <BlockReasonsChart blockReasons={data.blockReasons} />
        </DashCard>
        <DashCard title="Adopción y uso">
          <AdoptionSection
            adoptionStates={data.adoptionStates}
            adoption={data.adoption}
            freshness={data.freshness}
            partnerVisible={data.partnerVisible}
          />
        </DashCard>
      </div>
    </div>
  );
}
