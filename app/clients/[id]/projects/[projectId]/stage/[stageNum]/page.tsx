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
import ClientSessionCards from "@/components/clients/ClientSessionCards";
import AuditDetailClient from "@/app/audits/[id]/AuditDetailClient";
import type { LifecycleSnapshot, OwnerAssignmentStats, AuditInsight } from "@/lib/hubspot/portal-analyzer";

// ─── Definición de pasos por etapa ───────────────────────────────────────────

type StepKind = "note" | "context-only" | "audit" | "documents" | "portal" | "implementation";

type StepType =
  | { kind: "note"; placeholder?: string }
  | { kind: "context-only" }
  | { kind: "audit" }
  | { kind: "documents" }
  | { kind: "portal" }
  | { kind: "implementation" };

interface StepDef {
  label: string;
  shortLabel: string;
  type: StepType;
  keywords?: string[];
  /** Rol del equipo que se preselecciona automáticamente en el filtro de sesiones */
  preselectRole?: string;
}

interface StepStatus {
  hasContent: boolean;
  lastUpdated: Date | null;
}

// ─── Subetapas por tipo de servicio ──────────────────────────────────────────
// Basadas en los procesos de la base de conocimiento de Workspace IA.
// Clave: serviceType (string) → etapa (1|2|3) → lista de pasos.

type ServiceStageSteps = Record<number, StepDef[]>;

const STEPS_LOOP_MARKETING: ServiceStageSteps = {
  1: [
    { label: "Análisis inicial",                   shortLabel: "Análisis inicial",   type: { kind: "context-only" },  keywords: [], preselectRole: "Ventas" },
    { label: "Kickoff",                            shortLabel: "Kickoff",            type: { kind: "context-only" }, keywords: ["kickoff", "kick off"] },
    { label: "Entrevistas y focus groups",         shortLabel: "Entrevistas",        type: { kind: "documents" },     keywords: ["entrevista", "focus group"] },
    { label: "Mapeo de proceso, rutina y estructura", shortLabel: "Mapeo",           type: { kind: "note", placeholder: "Proceso de marketing actual, rutina del equipo, organigrama, tecnología utilizada y auditoría del CRM..." }, keywords: ["mapeo", "proceso", "rutina"] },
    { label: "Análisis de datos",                  shortLabel: "Datos",              type: { kind: "portal" },        keywords: ["datos", "data", "disponibilidad"] },
    { label: "Análisis del funnel de marketing",   shortLabel: "Funnel",             type: { kind: "portal" },        keywords: ["funnel", "embudo", "marketing"] },
    { label: "Informe de diagnóstico",             shortLabel: "Diagnóstico",        type: { kind: "note", placeholder: "Informe de diagnóstico: hallazgos clave, ubicación en la escala de rendimiento (ordenamiento / velocidad / efectividad) y factores explicativos..." }, keywords: ["diagnóstico", "informe"] },
  ],
  2: [
    { label: "Rediseño del proceso (Inbound Marketing)", shortLabel: "Proceso",      type: { kind: "note", placeholder: "Proceso de marketing rediseñado con Inbound Marketing. Incluye arquitectura base del CRM necesaria para ejecutarlo..." }, keywords: ["proceso", "inbound", "marketing"] },
    { label: "Rediseño de la rutina (Loop Marketing)",   shortLabel: "Rutina",       type: { kind: "note", placeholder: "Rutina de los ejecutivos de marketing basada en Loop Marketing. Incluye arquitectura base del CRM..." }, keywords: ["rutina", "loop"] },
    { label: "Políticas y ciclo de vida",                shortLabel: "Políticas",    type: { kind: "note", placeholder: "Definición de etapas del ciclo de vida y políticas de uso del CRM acordadas con el cliente..." }, keywords: ["políticas", "ciclo de vida"] },
    { label: "Diseño completo (entrega y aprobación)",   shortLabel: "Diseño",       type: { kind: "documents" },     keywords: ["diseño", "aprobación"] },
    { label: "Plan de piloto y escalamiento",             shortLabel: "Plan piloto", type: { kind: "note", placeholder: "Plan y cronograma de piloto y escalamiento: Champions, features habilitados, duración de olas, campaña de marketing..." }, keywords: ["plan", "piloto", "escalamiento"] },
    { label: "Habilitación de CRM",                      shortLabel: "CRM",         type: { kind: "implementation" }, keywords: ["crm", "habilitación"] },
    { label: "Entrenamiento del grupo piloto",            shortLabel: "Entrenamiento", type: { kind: "documents" },   keywords: ["entrenamiento", "onboarding", "capacitación"] },
  ],
  3: [
    { label: "Piloto",             shortLabel: "Piloto",      type: { kind: "note", placeholder: "Seguimiento del piloto: kick off, stand ups, informe de adopción semanal, ajustes de CRM y sesiones con liderazgo..." }, keywords: ["piloto", "kick off", "stand up"] },
    { label: "Escalamiento",       shortLabel: "Escalamiento", type: { kind: "note", placeholder: "Escalamiento en olas: entrenamiento por ola, kick off de ola, adopción semanal, ajustes e informe de cierre de ola..." }, keywords: ["escalamiento", "ola"] },
    { label: "Evolución continua", shortLabel: "Evolución",   type: { kind: "note", placeholder: "Evolución continua: sesiones semanales, informe semanal y mensual de rendimiento en las 3 dimensiones (ordenamiento / velocidad / efectividad)..." }, keywords: ["evolución", "rendimiento", "continua"] },
  ],
};

const STEPS_LOOP_SALES: ServiceStageSteps = {
  1: [
    { label: "Análisis inicial",                     shortLabel: "Análisis inicial", type: { kind: "context-only" },  keywords: [], preselectRole: "Ventas" },
    { label: "Kickoff",                              shortLabel: "Kickoff",          type: { kind: "context-only" }, keywords: ["kickoff", "kick off"] },
    { label: "Entrevistas y focus groups",           shortLabel: "Entrevistas",      type: { kind: "documents" },     keywords: ["entrevista", "focus group"] },
    { label: "Mapeo de proceso comercial, rutina y estructura", shortLabel: "Mapeo", type: { kind: "note", placeholder: "Proceso comercial actual, rutina del equipo de ventas, organigrama, tecnología utilizada y auditoría del pipeline en el CRM..." }, keywords: ["mapeo", "proceso", "rutina", "comercial"] },
    { label: "Análisis de datos comerciales",        shortLabel: "Datos",            type: { kind: "portal" },        keywords: ["datos", "data"] },
    { label: "Análisis del funnel de ventas",        shortLabel: "Funnel",           type: { kind: "portal" },        keywords: ["funnel", "ventas", "embudo"] },
    { label: "Informe de diagnóstico comercial",     shortLabel: "Diagnóstico",      type: { kind: "note", placeholder: "Informe de diagnóstico comercial: cómo vende el cliente hoy, escala de rendimiento y factores explicativos..." }, keywords: ["diagnóstico", "informe"] },
  ],
  2: [
    { label: "Rediseño del proceso (Inbound Sales)", shortLabel: "Proceso",          type: { kind: "note", placeholder: "Proceso comercial rediseñado con Inbound Sales. Incluye arquitectura base del CRM necesaria..." }, keywords: ["proceso", "inbound", "sales"] },
    { label: "Rediseño de la rutina (Loop Sales)",   shortLabel: "Rutina",           type: { kind: "note", placeholder: "Rutina de los ejecutivos de ventas basada en Loop Sales. Incluye arquitectura base del CRM..." }, keywords: ["rutina", "loop"] },
    { label: "Políticas y ciclo de vida",            shortLabel: "Políticas",        type: { kind: "note", placeholder: "Etapas del ciclo de vida, políticas de uso del CRM, protocolos de uso y reglas del juego del equipo comercial..." }, keywords: ["políticas", "ciclo de vida", "reglas"] },
    { label: "Diseño completo (entrega y aprobación)", shortLabel: "Diseño",         type: { kind: "documents" },     keywords: ["diseño", "aprobación"] },
    { label: "Plan de piloto y escalamiento",        shortLabel: "Plan piloto",      type: { kind: "note", placeholder: "Plan de piloto con protocolos, reglas del juego, indicadores de éxito, mecanismos de feedback y plan de escalamiento en olas..." }, keywords: ["plan", "piloto", "escalamiento"] },
    { label: "Habilitación de CRM",                  shortLabel: "CRM",             type: { kind: "implementation" }, keywords: ["crm", "habilitación"] },
    { label: "Entrenamiento del grupo piloto",        shortLabel: "Entrenamiento",   type: { kind: "documents" },     keywords: ["entrenamiento", "onboarding"] },
  ],
  3: [
    { label: "Piloto",                          shortLabel: "Piloto",        type: { kind: "note", placeholder: "Piloto de ventas: kick off, stand ups, informe de adopción semanal, sesión con liderazgo y ajustes de CRM..." }, keywords: ["piloto", "kick off"] },
    { label: "Escalamiento",                    shortLabel: "Escalamiento",  type: { kind: "note", placeholder: "Escalamiento en olas (mín. 6 semanas): entrenamiento por ola, kick off, adopción semanal e informe de cierre de ola..." }, keywords: ["escalamiento", "ola"] },
    { label: "Habilitación de liderazgo",       shortLabel: "Liderazgo",     type: { kind: "note", placeholder: "Mapeo y rediseño de rutina de liderazgo, habilitación del CRM para líderes, Sales Leadership Breeze Assistant y observación semanal de desempeño..." }, keywords: ["liderazgo", "líderes"] },
    { label: "Alineación (Acelerar)",           shortLabel: "Alineación",    type: { kind: "note", placeholder: "Acelerar: mapeo de hand offs, rediseño con Smarketing, habilitación CRM interdepartamental, agente de feedback para marketing y Sales & Service Hand Off..." }, keywords: ["alineación", "acelerar", "hand off", "smarketing"] },
    { label: "Evolución continua",              shortLabel: "Evolución",     type: { kind: "note", placeholder: "Evolución continua: sesiones semanales, informe semanal y mensual de rendimiento (ordenamiento / velocidad / efectividad)..." }, keywords: ["evolución", "rendimiento"] },
  ],
};

const STEPS_LOOP_SERVICE: ServiceStageSteps = {
  1: [
    { label: "Análisis inicial",                          shortLabel: "Análisis inicial", type: { kind: "context-only" },  keywords: [], preselectRole: "Ventas" },
    { label: "Kickoff",                                   shortLabel: "Kickoff",          type: { kind: "context-only" }, keywords: ["kickoff", "kick off"] },
    { label: "Entrevistas y focus groups",                shortLabel: "Entrevistas",      type: { kind: "documents" },     keywords: ["entrevista", "focus group"] },
    { label: "Mapeo de proceso de servicio, rutina y estructura", shortLabel: "Mapeo",    type: { kind: "note", placeholder: "Proceso de servicio al cliente actual, rutina de ejecutivos, organigrama, tecnología y auditoría del CRM..." }, keywords: ["mapeo", "proceso", "rutina", "servicio"] },
    { label: "Análisis de datos de servicio",             shortLabel: "Datos",            type: { kind: "portal" },        keywords: ["datos", "data"] },
    { label: "Análisis de conversión cliente-promotor",   shortLabel: "Conversión",       type: { kind: "portal" },        keywords: ["conversión", "promotor", "nps", "satisfacción"] },
    { label: "Informe de diagnóstico de servicio",        shortLabel: "Diagnóstico",      type: { kind: "note", placeholder: "Cómo opera el servicio al cliente hoy, escala de rendimiento y factores del sistema que explican los resultados actuales..." }, keywords: ["diagnóstico", "informe"] },
  ],
  2: [
    { label: "Rediseño del proceso (Inbound Service)", shortLabel: "Proceso",          type: { kind: "note", placeholder: "Proceso de servicio al cliente rediseñado con Inbound Service. Incluye arquitectura base del CRM..." }, keywords: ["proceso", "inbound", "service"] },
    { label: "Rediseño de la rutina (Loop Service)",   shortLabel: "Rutina",           type: { kind: "note", placeholder: "Rutina de los ejecutivos de servicio basada en Loop Service. Incluye arquitectura base del CRM..." }, keywords: ["rutina", "loop"] },
    { label: "Políticas y ciclo de vida",              shortLabel: "Políticas",        type: { kind: "note", placeholder: "Etapas del ciclo de vida (incluye Service Qualified Lead si aplica), políticas de uso del CRM, SLAs y reglas del juego..." }, keywords: ["políticas", "ciclo de vida", "sql", "service qualified"] },
    { label: "Diseño completo (entrega y aprobación)", shortLabel: "Diseño",           type: { kind: "documents" },     keywords: ["diseño", "aprobación"] },
    { label: "Plan de piloto y escalamiento",          shortLabel: "Plan piloto",      type: { kind: "note", placeholder: "Plan de piloto con protocolos, indicadores de éxito, mecanismos de feedback y plan de escalamiento en olas..." }, keywords: ["plan", "piloto", "escalamiento"] },
    { label: "Habilitación de CRM",                    shortLabel: "CRM",             type: { kind: "implementation" }, keywords: ["crm", "habilitación", "ticketing", "sla"] },
    { label: "Entrenamiento del grupo piloto",          shortLabel: "Entrenamiento",   type: { kind: "documents" },     keywords: ["entrenamiento", "onboarding"] },
  ],
  3: [
    { label: "Piloto",                          shortLabel: "Piloto",       type: { kind: "note", placeholder: "Piloto de servicio: kick off, stand ups, informe de adopción semanal, sesión con liderazgo y ajustes de CRM..." }, keywords: ["piloto", "kick off"] },
    { label: "Escalamiento",                    shortLabel: "Escalamiento", type: { kind: "note", placeholder: "Escalamiento en olas (mín. 6 semanas): entrenamiento por ola, kick off, adopción semanal e informe de cierre de ola..." }, keywords: ["escalamiento", "ola"] },
    { label: "Habilitación de liderazgo",       shortLabel: "Liderazgo",    type: { kind: "note", placeholder: "Mapeo y rediseño de rutina de liderazgo, habilitación CRM para líderes, Service Leadership Breeze Assistant y observación semanal de desempeño..." }, keywords: ["liderazgo"] },
    { label: "Alineación (Anticipar)",          shortLabel: "Alineación",   type: { kind: "note", placeholder: "Anticipar: mapeo de hand offs, rediseño con Customer Journey, habilitación CRM interdepartamental, agente de feedback y Sales & Service Hand Off..." }, keywords: ["alineación", "anticipar", "hand off", "customer journey"] },
    { label: "Evolución continua",              shortLabel: "Evolución",    type: { kind: "note", placeholder: "Evolución continua: sesiones semanales, informe semanal y mensual de rendimiento (ordenamiento / velocidad / efectividad)..." }, keywords: ["evolución", "rendimiento"] },
  ],
};

const STEPS_PROYECTO_TEMPORAL: ServiceStageSteps = {
  1: [
    { label: "Análisis inicial",          shortLabel: "Análisis inicial", type: { kind: "context-only" },  keywords: [], preselectRole: "Ventas" },
    { label: "Entrevistas",               shortLabel: "Entrevistas",      type: { kind: "documents" },     keywords: ["entrevista"] },
    { label: "Mapeo del proceso",         shortLabel: "Mapeo",            type: { kind: "note", placeholder: "Mapeo del proceso específico que el proyecto afecta, estado actual y oportunidades identificadas..." }, keywords: ["mapeo", "proceso"] },
    { label: "Informe de diagnóstico",    shortLabel: "Diagnóstico",      type: { kind: "note", placeholder: "Hallazgos del diagnóstico y recomendaciones para el diseño de la solución..." }, keywords: ["diagnóstico", "informe"] },
  ],
  2: [
    { label: "Diseño de la solución",  shortLabel: "Diseño",         type: { kind: "note", placeholder: "Diseño técnico y funcional de lo que se va a construir o configurar en HubSpot..." }, keywords: ["diseño", "solución"] },
    { label: "Habilitación en CRM",    shortLabel: "CRM",            type: { kind: "implementation" }, keywords: ["crm", "habilitación"] },
    { label: "Documentación",          shortLabel: "Documentación",  type: { kind: "documents" },     keywords: ["documentación"] },
  ],
  3: [
    { label: "Entrenamiento y entrega",        shortLabel: "Entrega",          type: { kind: "documents" },   keywords: ["entrenamiento", "entrega"] },
    { label: "Acompañamiento post-entrega",    shortLabel: "Post-entrega",     type: { kind: "note", placeholder: "Registro de dudas, ajustes y feedback durante el período de acompañamiento post-entrega..." }, keywords: ["post-entrega", "acompañamiento"] },
  ],
};

const SERVICE_STAGE_STEPS: Record<string, ServiceStageSteps> = {
  loop_marketing:    STEPS_LOOP_MARKETING,
  loop_sales:        STEPS_LOOP_SALES,
  loop_service:      STEPS_LOOP_SERVICE,
  proyecto_temporal: STEPS_PROYECTO_TEMPORAL,
};

// Fallback genérico (Loop Marketing como base)
const DEFAULT_STAGE_STEPS = STEPS_LOOP_MARKETING;

function getStageSteps(serviceType: string | null | undefined): ServiceStageSteps {
  if (serviceType && SERVICE_STAGE_STEPS[serviceType]) {
    return SERVICE_STAGE_STEPS[serviceType];
  }
  return DEFAULT_STAGE_STEPS;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


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

  // Verificar que el proyecto existe y pertenece al cliente
  const [client, project] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: { hubspotAccount: { select: { id: true } } },
    }),
    prisma.project.findUnique({ where: { id: projectId } }),
  ]);

  if (!client || !project || project.clientId !== id) notFound();

  const hasHubspot = !!client.hubspotAccount;

  // Subetapas dinámicas según tipo de servicio detectado
  const stageSteps = getStageSteps(project.serviceType);
  const steps = stageSteps[stage].filter(
    (step) => !(stage === 1 && step.type.kind === "audit" && !hasHubspot)
  );

  const stepIndex = Math.max(0, Math.min(steps.length - 1, parseInt(stepParam ?? "0")));
  const currentStep = steps[stepIndex];

  const clientDomain = (() => {
    const raw = client.company?.trim();
    if (!raw) return undefined;
    try {
      if (/^https?:\/\//i.test(raw))
        return new URL(raw).hostname.replace(/^www\./i, "").toLowerCase();
      const cleaned = raw.toLowerCase().replace(/^www\./, "");
      if (/^[\w-]+(\.[\w-]+)+$/.test(cleaned)) return cleaned;
    } catch { /* URL inválida */ }
    return undefined;
  })();

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

  // Calcular estado de cada paso
  const stepStatuses: StepStatus[] = steps.map((step, i) => {
    const stepNum = i + 1;
    switch (step.type.kind) {
      case "note": {
        const note = stageNotes.find((n) => n.step === stepNum);
        return { hasContent: !!(note?.content?.trim()), lastUpdated: note?.updatedAt ?? null };
      }
      case "context-only":
        return { hasContent: contextCardsCount > 0, lastUpdated: lastAgentRun?.updatedAt ?? null };
      case "audit":
        return { hasContent: !!latestAudit, lastUpdated: latestAudit?.updatedAt ?? null };
      case "documents": {
        const docs = stageDocuments.filter((d) => d.step === stepNum);
        return { hasContent: docs.length > 0, lastUpdated: null };
      }
      case "portal":
        return { hasContent: false, lastUpdated: null };
      case "implementation":
        return { hasContent: implementationCount > 0, lastUpdated: null };
      default:
        return { hasContent: false, lastUpdated: null };
    }
  });

  const currentStatus = stepStatuses[stepIndex];

  return (
    <div className="flex" style={{ height: "calc(100vh - 113px)" }}>
      {/* ── Sidebar de pasos ──────────────────────────────────────────── */}
      <nav className="flex-shrink-0 w-48 border-r border-gray-800 py-3 overflow-y-auto">
        <ul className="space-y-0.5">
          {steps.map((stepDef, i) => {
            const isActive = i === stepIndex;
            const status = stepStatuses[i];
            return (
              <li key={i}>
                <Link
                  href={`/clients/${id}/projects/${projectId}/stage/${stage}?step=${i}`}
                  className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                    isActive
                      ? "text-white bg-gray-800 border-r-2 border-brand"
                      : "text-gray-400 hover:text-gray-300 hover:bg-gray-800/50"
                  }`}
                >
                  {/* Número con badge de completitud */}
                  <span className="relative flex-shrink-0">
                    <span
                      className={`w-5 h-5 rounded-full border flex items-center justify-center text-2xs font-semibold ${
                        isActive
                          ? "bg-brand-soft border-brand/30 text-brand-dark"
                          : "border-gray-700 text-gray-600"
                      }`}
                    >
                      {i + 1}
                    </span>
                    {/* Dot de completitud */}
                    {!isActive && status.hasContent && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-gray-500" />
                    )}
                  </span>

                  <span className="flex-1 truncate text-xs">{stepDef.shortLabel}</span>

                  {/* Icono de tipo */}
                  <StepTypeIcon kind={stepDef.type.kind} isActive={isActive} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Contenido del paso ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Header del paso */}
        <div className="flex-shrink-0 px-6 py-3.5 border-b border-gray-800 flex items-center gap-3">
          <span className="w-6 h-6 rounded-full bg-brand-soft border border-brand/30 flex items-center justify-center text-xs font-bold text-brand-dark flex-shrink-0">
            {stepIndex + 1}
          </span>

          <h1 className="text-sm font-semibold text-white flex-1 truncate">{currentStep.label}</h1>

          {/* Botón de acción (solo para auditoría) */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {currentStep.type.kind === "audit" && latestAudit && (
              <AuditReAnalyzeButton auditId={latestAudit.id} />
            )}
          </div>
        </div>

        {/* Contenido */}
        <div className={`flex-1 min-h-0 ${currentStep.type.kind === "audit" ? "flex flex-col overflow-hidden" : "overflow-y-auto p-6"}`}>
          {currentStep.type.kind !== "audit" && currentStep.type.kind !== "portal" && (
            <>
              {/* 1. Secciones de contexto (multi-agente por subetapa) */}
              <StepSections
                key={`sections-step-${stepIndex}`}
                clientId={id}
                projectId={projectId}
                stage={stage}
                stepIndex={stepIndex}
                stepLabel={currentStep.label}
                stepKeywords={currentStep.keywords}
              />

              {/* 2. Sesiones */}
              <div className="mt-4">
                <ClientSessionCards
                  key={`sessions-step-${stepIndex}`}
                  clientId={id}
                  domain={clientDomain}
                  company={client.company ?? undefined}
                  filterMode="name"
                  defaultTags={currentStep.keywords?.length ? currentStep.keywords : undefined}
                  preselectRole={currentStep.preselectRole}
                />
              </div>
            </>
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
