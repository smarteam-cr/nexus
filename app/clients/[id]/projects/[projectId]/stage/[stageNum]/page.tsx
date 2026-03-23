import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Sparkles,
  Search,
  Pencil,
  FileText,
  BarChart2,
  Zap,
} from "lucide-react";
import StageNoteEditor from "@/components/clients/StageNoteEditor";
import ClientDocuments from "@/components/clients/ClientDocuments";
import StepSections from "@/components/clients/StepSections";
import NewAuditButtonClient from "@/app/clients/[id]/stage/[stageNum]/NewAuditButtonClient";
import NewImplementationButton from "@/app/clients/[id]/stage/[stageNum]/NewImplementationButton";
import AuditReAnalyzeButton from "@/components/agents/AuditReAnalyzeButton";
import AuditDetailClient from "@/app/audits/[id]/AuditDetailClient";
import TrackCurrentStep from "@/components/clients/TrackCurrentStep";
import type { LifecycleSnapshot, OwnerAssignmentStats, AuditInsight } from "@/lib/hubspot/portal-analyzer";
import { getStageSteps, STAGE_LABELS } from "@/lib/steps";
import type { StepKind, StepType } from "@/lib/steps";

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface StepStatus {
  hasContent: boolean;
  lastUpdated: Date | null;
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default async function ProjectStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; projectId: string; stageNum: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const { id, projectId, stageNum } = await params;
  const { step: stepParam } = await searchParams;

  const stage = parseInt(stageNum);
  if (![1, 2, 3].includes(stage)) notFound();

  const [client, project] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: { hubspotAccount: { select: { id: true } } },
    }),
    prisma.project.findUnique({ where: { id: projectId } }),
  ]);

  if (!client || !project || project.clientId !== id) notFound();

  const hasHubspot = !!client.hubspotAccount;

  const stageSteps = getStageSteps(project.serviceType);
  const steps = stageSteps[stage].filter(
    (step) => !(stage === 1 && step.type.kind === "audit" && !hasHubspot)
  );

  const stepIndex = Math.max(0, Math.min(steps.length - 1, parseInt(stepParam ?? "0")));
  const currentStep = steps[stepIndex];

  // ── Fetch de completitud y frescura ────────────────────────────────────────
  const [stageNotes, contextCardsCount, latestAudit, stageDocuments, implementationCount, lastAgentRun] =
    await Promise.all([
      prisma.stageNote.findMany({
        where: { clientId: id, stage },
        select: { step: true, content: true, updatedAt: true },
      }),
      prisma.clientContextCard.count({ where: { clientId: id } }),
      prisma.audit.findFirst({
        where: { clientId: id },
        orderBy: { createdAt: "desc" },
        select: { id: true, updatedAt: true },
      }),
      prisma.clientDocument.findMany({
        where: { clientId: id, stage, projectId },
        select: { step: true },
      }),
      prisma.implementation.count({ where: { clientId: id, archived: false } }),
      prisma.agentRun.findFirst({
        where: { clientId: id, stage, status: "DONE" },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 57px)" }}>
      <TrackCurrentStep projectId={projectId} stage={stage} step={stepIndex} />
      {/* ── Action bar (solo si hay acciones) ──────────────────────────── */}
      {currentStep.type.kind === "audit" && latestAudit && (
        <div className="flex-shrink-0 px-6 py-2 border-b border-gray-800 flex items-center justify-end">
          <AuditReAnalyzeButton auditId={latestAudit.id} />
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className={`flex-1 min-h-0 ${currentStep.type.kind === "audit" ? "flex flex-col overflow-hidden" : "overflow-y-auto p-6"}`}>
        {currentStep.type.kind !== "audit" && currentStep.type.kind !== "portal" && (
          <StepSections
            key={`sections-step-${stepIndex}`}
            clientId={id}
            projectId={projectId}
            stage={stage}
            stepIndex={stepIndex}
            stepLabel={currentStep.label}
            stepKeywords={currentStep.keywords}
          />
        )}

        {/* 3. Step content (note editor / docs / implementation / etc.) */}
        <StepContent
          type={currentStep.type}
          clientId={id}
          projectId={projectId}
          stage={stage}
          step={stepIndex + 1}
          hasHubspot={hasHubspot}
          latestAuditId={latestAudit?.id ?? null}
        />
      </div>
    </div>
  );
}

// ── Icono de tipo de paso en sidebar (lucide-react) ──────────────────────────

function StepTypeIcon({ kind, isActive }: { kind: StepKind; isActive: boolean }) {
  const cls = `w-3 h-3 flex-shrink-0 ${isActive ? "text-gray-400" : "text-gray-600"}`;
  const icons: Record<StepKind, ReactNode> = {
    "context-only": <Sparkles  className={cls} strokeWidth={1.75} />,
    audit:          <Search    className={cls} strokeWidth={1.75} />,
    note:           <Pencil    className={cls} strokeWidth={1.75} />,
    documents:      <FileText  className={cls} strokeWidth={1.75} />,
    portal:         <BarChart2 className={cls} strokeWidth={1.75} />,
    implementation: <Zap       className={cls} strokeWidth={1.75} />,
  };

  return <>{icons[kind] ?? null}</>;
}

// ── Renderizador de contenido por tipo ────────────────────────────────────────

async function StepContent({
  type,
  clientId,
  projectId,
  stage,
  step,
  hasHubspot,
  latestAuditId,
}: {
  type: StepType;
  clientId: string;
  projectId: string;
  stage: number;
  step: number;
  hasHubspot: boolean;
  latestAuditId: string | null;
}) {
  if (type.kind === "context-only") {
    return null;
  }

  if (type.kind === "note") {
    return (
      <StageNoteEditor
        clientId={clientId}
        stage={stage}
        step={step}
        placeholder={type.placeholder}
      />
    );
  }

  if (type.kind === "documents") {
    return (
      <div className="space-y-4 max-w-2xl">
        <p className="text-sm text-gray-400">
          Adjunta URLs de sesiones de Fireflies, transcripciones, briefs o cualquier documento relevante.
        </p>
        <ClientDocuments clientId={clientId} projectId={projectId} stage={stage} step={step} />
      </div>
    );
  }

  if (type.kind === "audit") {
    return <AuditStep clientId={clientId} stage={stage} hasHubspot={hasHubspot} auditId={latestAuditId} />;
  }

  if (type.kind === "portal") {
    return <PortalStep hasHubspot={hasHubspot} />;
  }

  if (type.kind === "implementation") {
    return <ImplementationStep clientId={clientId} hasHubspot={hasHubspot} />;
  }

  return null;
}

// ── Paso: Auditoría HubSpot ───────────────────────────────────────────────────

async function AuditStep({
  clientId,
  stage,
  hasHubspot,
  auditId,
}: {
  clientId: string;
  stage: number;
  hasHubspot: boolean;
  auditId: string | null;
}) {
  if (!auditId) {
    return (
      <div className="space-y-4 max-w-2xl p-6">
        <p className="text-sm text-gray-400">
          Realiza una auditoría del CRM del cliente para analizar la configuración actual, calidad de datos y oportunidades de mejora.
        </p>
        {!hasHubspot && (
          <WarningBanner text="Conecta HubSpot en Configuración para crear auditorías" />
        )}
        {hasHubspot && <NewAuditButtonClient clientId={clientId} stage={stage} />}
      </div>
    );
  }

  const audit = await prisma.audit.findUnique({ where: { id: auditId } });
  if (!audit) return null;

  const data = audit.data as unknown as LifecycleSnapshot | null;
  const lifecycleStats = data?.lifecycleStats;

  const contacts = lifecycleStats?.contacts ?? [];
  const companies = lifecycleStats?.companies ?? [];
  const totalContacts = lifecycleStats?.totalContacts ?? 0;
  const totalCompanies = lifecycleStats?.totalCompanies ?? 0;
  const totalDeals = lifecycleStats?.totalDeals ?? 0;
  const totalTickets = lifecycleStats?.totalTickets ?? 0;
  const lifecycleWorkflows = lifecycleStats?.lifecycleWorkflows ?? [];
  const ownerStats: OwnerAssignmentStats | undefined = data?.ownerStats ?? undefined;
  const insights: AuditInsight[] = data?.insights?.insights ?? [];

  const insightsGeneratedAt = data?.insights?.generatedAt
    ? new Date(data.insights.generatedAt).toLocaleDateString("es-ES", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  const capturedAt = data?.capturedAt
    ? new Date(data.capturedAt).toLocaleDateString("es-ES", {
        day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <AuditDetailClient
      auditId={audit.id}
      capturedAt={capturedAt}
      insightsGeneratedAt={insightsGeneratedAt}
      contacts={contacts}
      companies={companies}
      totalContacts={totalContacts}
      totalCompanies={totalCompanies}
      totalDeals={totalDeals}
      totalTickets={totalTickets}
      lifecycleWorkflows={lifecycleWorkflows}
      ownerStats={ownerStats}
      insights={insights}
      hasLifecycleStats={!!lifecycleStats}
    />
  );
}

// ── Paso: Portal / Funnel ─────────────────────────────────────────────────────

function PortalStep({ hasHubspot }: { hasHubspot: boolean }) {
  if (!hasHubspot) {
    return <WarningBanner text="Conecta HubSpot en Configuración para ver datos del portal" />;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-gray-400">
        Accede al portal de HubSpot del cliente para analizar el funnel de lifecycle, propiedades CRM y disponibilidad de datos.
      </p>
      <Link
        href="/portal"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-800 text-gray-300 hover:text-white text-sm font-medium transition-all"
      >
        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Abrir Portal Analyzer
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </Link>
    </div>
  );
}

// ── Paso: Implementación CRM ──────────────────────────────────────────────────

async function ImplementationStep({ clientId, hasHubspot }: { clientId: string; hasHubspot: boolean }) {
  const implementations = await prisma.implementation.findMany({
    where: { clientId, archived: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, createdAt: true },
  });

  const statusColors: Record<string, string> = {
    PLANNING: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    READY: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    EXECUTING: "text-brand-light bg-brand/10 border-brand/20",
    DONE: "text-green-400 bg-green-500/10 border-green-500/20",
    PAUSED: "text-gray-400 bg-gray-500/10 border-gray-500/20",
  };

  const statusLabels: Record<string, string> = {
    PLANNING: "Planificando",
    READY: "Listo",
    EXECUTING: "Ejecutando",
    DONE: "Completado",
    PAUSED: "Pausado",
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-gray-400">
        Planifica y ejecuta la configuración del CRM usando el asistente de IA. Crea las propiedades, pipelines, listas y workflows necesarios.
      </p>

      {!hasHubspot && (
        <WarningBanner text="Conecta HubSpot en Configuración para crear implementaciones" />
      )}

      {implementations.length > 0 && (
        <div className="space-y-2">
          {implementations.map((impl) => (
            <Link
              key={impl.id}
              href={`/implementation/${impl.id}/plan`}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-800/70 transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-brand-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{impl.name}</p>
                <p className="text-xs text-gray-500">
                  {new Date(impl.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${statusColors[impl.status] ?? ""}`}>
                {statusLabels[impl.status] ?? impl.status}
              </span>
              <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}

      {hasHubspot && <NewImplementationButton clientId={clientId} />}
    </div>
  );
}

// ── Componente de aviso reutilizable ─────────────────────────────────────────

function WarningBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm max-w-lg">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      {text}
    </div>
  );
}
