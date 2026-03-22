"use client";

import { useState } from "react";
import type { PortalSnapshot } from "@/lib/hubspot/portal-analyzer";
import type { PropertyDef } from "@/lib/hubspot/reader";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab =
  | "salud"
  | "arquitectura"
  | "segmentos"
  | "pipelines"
  | "automatizaciones"
  | "mas"
  | "sin-acceso";

const TABS: { id: Tab; label: string }[] = [
  { id: "salud",            label: "Salud" },
  { id: "arquitectura",     label: "Arquitectura" },
  { id: "segmentos",        label: "Segmentos" },
  { id: "pipelines",        label: "Pipelines" },
  { id: "automatizaciones", label: "Automatizaciones" },
  { id: "mas",              label: "Más" },
  { id: "sin-acceso",       label: "Sin acceso" },
];

const STD_OBJECTS = [
  { key: "contacts", label: "Contactos",  icon: "👤", hasLifecycle: true },
  { key: "companies", label: "Empresas",  icon: "🏢", hasLifecycle: true },
  { key: "deals",     label: "Negocios",  icon: "💼", hasLifecycle: false },
  { key: "tickets",   label: "Tickets",   icon: "🎫", hasLifecycle: false },
];

const ACTIVITY_COLORS = {
  green:  "bg-green-500/15 text-green-400 border-green-500/20",
  yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  red:    "bg-red-500/15 text-red-400 border-red-500/20",
  gray:   "bg-gray-800 text-gray-500 border-gray-700",
} as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-8 rounded-xl border border-dashed border-gray-800 flex items-center justify-center">
      <p className="text-sm text-gray-600">{text}</p>
    </div>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Horizontal bar chart (like HubSpot reports)
function HorizontalBarChart({
  stages,
  color = "orange",
}: {
  stages: { label: string; count: number }[];
  color?: "orange" | "blue" | "green";
}) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  const barColor = {
    orange: "bg-brand-light/80",
    blue:   "bg-blue-400/80",
    green:  "bg-green-400/80",
  }[color];

  return (
    <div className="space-y-2">
      {stages.map((stage) => (
        <div key={stage.label} className="flex items-center gap-3">
          <span className="text-xs text-gray-400 w-36 text-right shrink-0 truncate">
            {stage.label}
          </span>
          <div className="flex-1 relative h-7 bg-gray-800 rounded overflow-hidden">
            <div
              className={`h-full ${barColor} rounded transition-all duration-500`}
              style={{ width: `${Math.max((stage.count / max) * 100, 2)}%` }}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-white">
              {stage.count.toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Properties modal
function PropertiesModal({
  objectLabel,
  properties,
  onClose,
}: {
  objectLabel: string;
  properties: PropertyDef[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = search
    ? properties.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.label.toLowerCase().includes(search.toLowerCase())
      )
    : properties;

  const typeColor: Record<string, string> = {
    string:      "bg-blue-500/15 text-blue-400",
    number:      "bg-purple-500/15 text-purple-400",
    bool:        "bg-green-500/15 text-green-400",
    enumeration: "bg-brand/15 text-brand-light",
    date:        "bg-pink-500/15 text-pink-400",
    datetime:    "bg-pink-500/15 text-pink-400",
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[82vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold text-sm">
              Propiedades · {objectLabel}
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">
              {properties.length} propiedades totales
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-800">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar propiedad por nombre o label..."
            autoFocus
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 p-2">
          {filtered.map((prop) => (
            <div
              key={prop.name}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-900 transition-colors group"
            >
              <div className="min-w-0 mr-3">
                <p className="text-sm text-white truncate">{prop.label}</p>
                <p className="text-xs text-gray-500 truncate font-mono">{prop.name}</p>
                {prop.description && (
                  <p className="text-2xs text-gray-700 truncate mt-0.5">{prop.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={`text-2xs px-2 py-0.5 rounded font-medium ${
                    typeColor[prop.type] ?? "bg-gray-800 text-gray-400"
                  }`}
                >
                  {prop.type}
                </span>
                <span className="text-2xs px-2 py-0.5 rounded bg-gray-800/50 text-gray-600">
                  {prop.groupName}
                </span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-gray-600 text-sm py-10">
              Sin resultados para &quot;{search}&quot;
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PortalTabs({ snapshot }: { snapshot: PortalSnapshot }) {
  const [activeTab, setActiveTab] = useState<Tab>("salud");
  const [propertiesModal, setPropertiesModal] = useState<{
    label: string;
    properties: PropertyDef[];
  } | null>(null);

  const { accountState: state, lifecycleStats: lifecycle, pipelineActivity, accountDetails: details, contactInsights } = snapshot;

  // Lists split
  const activeLists  = state.lists.filter(
    (l) => l.listType === "DYNAMIC" || l.listType?.toLowerCase().includes("dynamic")
  );
  const staticLists  = state.lists.filter(
    (l) => l.listType === "STATIC" || l.listType?.toLowerCase().includes("static")
  );

  // Lifecycle
  const contactStages = lifecycle.contacts.filter((s) => s.count > 0);
  const companyStages = lifecycle.companies.filter((s) => s.count > 0);
  const hasCompanies  = lifecycle.totalCompanies > 0;

  // ── Health scores (computed from existing snapshot data) ─────────────
  const totalContactsWithStage = lifecycle.contacts.reduce((a, b) => a + b.count, 0);
  const lifecycleCoverage = lifecycle.totalContacts > 0
    ? Math.round((totalContactsWithStage / lifecycle.totalContacts) * 100)
    : 0;

  const pipelineList = Object.values(state.pipelines).flat();
  const pipelineActivityValues = pipelineList.map((p) => pipelineActivity[p.id]?.activityColor ?? "gray");
  const activePipelines  = pipelineActivityValues.filter((c) => c === "green").length;
  const warningPipelines = pipelineActivityValues.filter((c) => c === "yellow").length;
  const inactivePipelines = pipelineActivityValues.filter((c) => c === "red" || c === "gray").length;

  const enabledWorkflows = state.workflows.filter((w) => w.enabled).length;
  const workflowRate = state.workflows.length > 0
    ? Math.round((enabledWorkflows / state.workflows.length) * 100)
    : null;

  type HealthStatus = "good" | "warning" | "alert" | "unknown";
  interface HealthIndicator {
    label: string;
    status: HealthStatus;
    metric: string;
    insight: string;
    benchmark?: string;
  }

  const healthIndicators: HealthIndicator[] = [
    // Arquitectura de datos
    {
      label: "Objetos y propiedades",
      status: state.customObjects.length > 0 ? "good"
            : Object.values(state.properties).some(p => p.length > 20) ? "good" : "warning",
      metric: `${Object.values(state.properties).reduce((a, b) => a + b.length, 0)} propiedades · ${state.customObjects.length} objetos custom`,
      insight: state.customObjects.length > 0
        ? "Custom objects configurados — arquitectura avanzada"
        : "Solo objetos estándar — considera si tu modelo de datos es suficiente",
      benchmark: "Portales pro tienen custom objects para relaciones complejas",
    },
    // Ciclo de vida
    {
      label: "Cobertura del ciclo de vida",
      status: lifecycleCoverage >= 70 ? "good" : lifecycleCoverage >= 30 ? "warning" : "alert",
      metric: `${lifecycleCoverage}% de contactos con etapa asignada (${totalContactsWithStage.toLocaleString()} / ${lifecycle.totalContacts.toLocaleString()})`,
      insight: lifecycleCoverage >= 70
        ? "Buena cobertura de lifecycle stages"
        : lifecycleCoverage >= 30
        ? "Muchos contactos sin etapa asignada — dificulta la segmentación"
        : "La mayoría de contactos no tiene etapa — el funnel no es medible",
      benchmark: "Benchmark: >70% cobertura para reporting confiable",
    },
    // Pipelines
    {
      label: "Actividad de pipelines",
      status: pipelineList.length === 0 ? "unknown"
            : activePipelines > warningPipelines + inactivePipelines ? "good"
            : inactivePipelines > activePipelines ? "alert" : "warning",
      metric: pipelineList.length === 0 ? "Sin pipelines"
            : `${activePipelines} activos · ${warningPipelines} poco activos · ${inactivePipelines} inactivos`,
      insight: pipelineList.length === 0 ? "No hay pipelines configurados"
            : activePipelines > 0
            ? `${activePipelines} pipeline(s) con deals recientes (<30 días)`
            : "Ningún pipeline tiene actividad reciente — revisar deals estancados",
      benchmark: "Pipeline activo = deals modificados en últimos 30 días",
    },
    // Automatización
    {
      label: "Automatización",
      status: state.workflows.length === 0 ? "unknown"
            : workflowRate !== null && workflowRate >= 70 ? "good"
            : workflowRate !== null && workflowRate >= 40 ? "warning" : "alert",
      metric: state.workflows.length === 0 ? "Sin acceso o sin workflows"
            : `${enabledWorkflows}/${state.workflows.length} workflows activos (${workflowRate}%)`,
      insight: state.workflows.length === 0
        ? "No hay workflows — puede ser falta de scope o cuenta sin automatizaciones"
        : workflowRate !== null && workflowRate >= 70
        ? "Alta tasa de workflows activos — buena adopción de automatización"
        : "Muchos workflows inactivos — posibles workflows zombie o sin mantenimiento",
      benchmark: "Benchmark: >60% de workflows activos es saludable",
    },
    // Segmentación
    {
      label: "Segmentación",
      status: (state.accessErrors ?? {})["Segmentos"] ? "unknown"
            : state.lists.length >= 10 ? "good"
            : state.lists.length >= 3  ? "warning" : "alert",
      metric: (state.accessErrors ?? {})["Segmentos"]
        ? "Sin acceso a segmentos"
        : `${state.lists.length} segmentos · ${activeLists.length} dinámicos · ${staticLists.length} estáticos`,
      insight: (state.accessErrors ?? {})["Segmentos"]
        ? (state.accessErrors ?? {})["Segmentos"]
        : state.lists.length === 0
        ? "Sin segmentos configurados — no hay segmentación activa"
        : state.lists.length < 3
        ? "Pocos segmentos — revisar si la segmentación es suficiente para el negocio"
        : "Segmentación presente — revisar si los segmentos dinámicos están actualizados",
      benchmark: "Portales activos suelen tener >10 segmentos operativos",
    },
    // Formularios
    {
      label: "Captura de leads (formularios)",
      status: state.forms.length >= 3 ? "good"
            : state.forms.length >= 1 ? "warning" : "alert",
      metric: `${state.forms.length} formularios configurados`,
      insight: state.forms.length === 0
        ? "Sin formularios — ¿cómo están llegando los leads al CRM?"
        : state.forms.length === 1
        ? "Solo 1 formulario — considerar formularios por etapa del funnel"
        : "Formularios presentes — verificar que todos estén conectados a workflows",
      benchmark: "Al menos 1 formulario por etapa: TOFU, MOFU, BOFU",
    },
  ];

  const goodCount    = healthIndicators.filter(h => h.status === "good").length;
  const warningCount = healthIndicators.filter(h => h.status === "warning").length;
  const alertCount   = healthIndicators.filter(h => h.status === "alert").length;
  const overallScore = Math.round((goodCount / healthIndicators.filter(h => h.status !== "unknown").length) * 100);

  // "Sin acceso" — usa errores reales reportados por el reader
  const accessErrors: Record<string, string> = state.accessErrors ?? {};

  type NoAccessItem = { feature: string; scope: string; reason: string };
  const noAccess: NoAccessItem[] = [
    accessErrors["Workflows"]
      ? {
          feature: "Workflows / Automatizaciones",
          scope: "automation",
          reason: accessErrors["Workflows"],
        }
      : null,
    accessErrors["Formularios"]
      ? {
          feature: "Formularios de marketing",
          scope: "forms",
          reason: accessErrors["Formularios"],
        }
      : null,
    accessErrors["Segmentos"]
      ? {
          feature: "Segmentos (Listas CRM)",
          scope: "crm.lists.read",
          reason: accessErrors["Segmentos"],
        }
      : null,
    accessErrors["Secuencias"]
      ? {
          feature: "Secuencias (Sales Hub)",
          scope: "automation.sequences.read",
          reason: accessErrors["Secuencias"],
        }
      : null,
    accessErrors["Equipos"]
      ? {
          feature: "Equipos (Teams)",
          scope: "settings.users.teams.read",
          reason: accessErrors["Equipos"],
        }
      : null,
    accessErrors["Usuarios"]
      ? {
          feature: "Usuarios",
          scope: "settings.users.read",
          reason: accessErrors["Usuarios"],
        }
      : null,
  ].filter(Boolean) as NoAccessItem[];

  const openPropertiesFor = (key: string, label: string) => {
    const props = state.properties[key] ?? [];
    setPropertiesModal({ label, properties: props });
  };

  return (
    <>
      {/* Properties modal */}
      {propertiesModal && (
        <PropertiesModal
          objectLabel={propertiesModal.label}
          properties={propertiesModal.properties}
          onClose={() => setPropertiesModal(null)}
        />
      )}

      {/* ── Tab navigation ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 px-8 border-b border-gray-800 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "text-brand-light"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
            {tab.id === "sin-acceso" && noAccess.length > 0 && (
              <span className="ml-1.5 text-2xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                {noAccess.length}
              </span>
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────── */}
      <div className="px-8 py-6 space-y-8 overflow-y-auto flex-1">

        {/* ════════════════ SALUD ══════════════════════════════════════ */}
        {activeTab === "salud" && (
          <>
            {/* Overview row */}
            <div className="grid grid-cols-3 gap-3">
              {/* Score general */}
              <div className="p-5 rounded-xl bg-gray-900 border border-gray-800 flex flex-col items-center justify-center text-center">
                <div className={`text-4xl font-black mb-1 ${
                  overallScore >= 70 ? "text-green-400"
                  : overallScore >= 40 ? "text-yellow-400" : "text-red-400"
                }`}>
                  {isNaN(overallScore) ? "—" : `${overallScore}%`}
                </div>
                <p className="text-xs text-gray-500">Score de salud general</p>
                <div className="flex items-center gap-3 mt-3 text-2xs">
                  <span className="text-green-400">{goodCount} OK</span>
                  <span className="text-yellow-400">{warningCount} aviso</span>
                  <span className="text-red-400">{alertCount} crítico</span>
                </div>
              </div>

              {/* Tipo de CRM */}
              <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Tipo de CRM</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${hasCompanies ? "bg-blue-400" : "bg-gray-600"}`} />
                    <span className="text-sm text-white font-medium">{hasCompanies ? "B2B" : "B2C / Sin empresas"}</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    {hasCompanies
                      ? `${lifecycle.totalCompanies.toLocaleString()} empresas en CRM · pipeline de ventas corporativo`
                      : "Sin empresas configuradas — modelo directo al consumidor"}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${lifecycle.totalContacts > 0 ? "bg-green-400" : "bg-gray-600"}`} />
                    <span className="text-xs text-gray-400">
                      {lifecycle.totalContacts.toLocaleString()} contactos en CRM
                    </span>
                  </div>
                </div>
              </div>

              {/* Licencia inferida */}
              <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Licencia detectada</p>
                {details?.inferredTier ? (
                  <>
                    <span className={`text-sm font-bold ${
                      details.inferredTier.color === "purple" ? "text-purple-300"
                      : details.inferredTier.color === "blue" ? "text-blue-300"
                      : details.inferredTier.color === "orange" ? "text-brand-light"
                      : "text-gray-400"
                    }`}>
                      {details.inferredTier.label}
                    </span>
                    <ul className="mt-2 space-y-1">
                      {details.inferredTier.evidence.map((e, i) => (
                        <li key={i} className="text-2xs text-gray-600 flex items-start gap-1">
                          <span className="mt-0.5 shrink-0">·</span>{e}
                        </li>
                      ))}
                    </ul>
                    <p className="text-2xs text-gray-700 mt-2 italic">
                      Inferido — no hay endpoint oficial de tier en la API de HubSpot
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-gray-600">No disponible — actualiza los datos</p>
                )}
              </div>
            </div>

            {/* Health indicators */}
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Indicadores de auditoría
              </h2>
              <div className="space-y-2">
                {healthIndicators.map((h) => {
                  const statusIcon = {
                    good:    { icon: "✅", bg: "border-green-500/20",  label: "bg-green-500/10 text-green-400" },
                    warning: { icon: "⚠️", bg: "border-yellow-500/20", label: "bg-yellow-500/10 text-yellow-400" },
                    alert:   { icon: "🔴", bg: "border-red-500/20",    label: "bg-red-500/10 text-red-400" },
                    unknown: { icon: "⬜", bg: "border-gray-700",       label: "bg-gray-800 text-gray-500" },
                  }[h.status];

                  return (
                    <div key={h.label} className={`p-4 rounded-xl bg-gray-900 border ${statusIcon.bg}`}>
                      <div className="flex items-start gap-3">
                        <span className="text-base mt-0.5 shrink-0">{statusIcon.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-white">{h.label}</span>
                            <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${statusIcon.label}`}>
                              {h.status === "good" ? "OK" : h.status === "warning" ? "Revisar" : h.status === "alert" ? "Crítico" : "Sin datos"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{h.metric}</p>
                          <p className="text-xs text-gray-600 mt-1 italic">{h.insight}</p>
                          {h.benchmark && (
                            <p className="text-2xs text-gray-700 mt-1">📊 {h.benchmark}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── Contact Insights ─────────────────────────────────────── */}
            {contactInsights && (
              <>
                {/* ── Generación de Contactos por Fuente ── */}
                {(contactInsights.byOriginalSource.length > 0 || contactInsights.byLatestSource.length > 0) && (
                  <section>
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                      Generación de contactos · Fuentes
                    </h2>
                    <div className={`grid gap-4 ${contactInsights.byLatestSource.length > 0 ? "md:grid-cols-2" : ""}`}>
                      {contactInsights.byOriginalSource.length > 0 && (
                        <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                          <p className="text-sm font-semibold text-white mb-4">Fuente original</p>
                          <HorizontalBarChart
                            stages={contactInsights.byOriginalSource
                              .sort((a, b) => b.count - a.count)
                              .slice(0, 8)
                              .map((s) => ({ label: s.label, count: s.count }))}
                            color="blue"
                          />
                        </div>
                      )}
                      {contactInsights.byLatestSource.length > 0 && (
                        <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                          <p className="text-sm font-semibold text-white mb-4">Última fuente de conversión</p>
                          <HorizontalBarChart
                            stages={contactInsights.byLatestSource
                              .sort((a, b) => b.count - a.count)
                              .slice(0, 8)
                              .map((s) => ({ label: s.label, count: s.count }))}
                            color="orange"
                          />
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* ── Lead Status ── */}
                {contactInsights.byLeadStatus.length > 0 && (
                  <section>
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                      Estado de lead (hs_lead_status)
                    </h2>
                    <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                      <HorizontalBarChart
                        stages={contactInsights.byLeadStatus
                          .sort((a, b) => b.count - a.count)
                          .map((s) => ({ label: s.label, count: s.count }))}
                        color="green"
                      />
                    </div>
                  </section>
                )}

                {/* ── Industria (empresas) ── */}
                {contactInsights.byIndustry.length > 0 && (
                  <section>
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                      Industria de empresas (Top 10)
                    </h2>
                    <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                      <HorizontalBarChart
                        stages={contactInsights.byIndustry
                          .sort((a, b) => b.count - a.count)
                          .slice(0, 10)
                          .map((s) => ({ label: s.label, count: s.count }))}
                        color="orange"
                      />
                    </div>
                  </section>
                )}

                {/* ── Salud de base de datos ── */}
                <section>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                    Salud de la base de datos de contactos
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Hard bounces */}
                    {(() => {
                      const pct = lifecycle.totalContacts > 0
                        ? Math.round((contactInsights.hardBounceCount / lifecycle.totalContacts) * 100)
                        : 0;
                      const status = pct === 0 ? "good" : pct < 3 ? "warning" : "alert";
                      return (
                        <div className={`p-4 rounded-xl bg-gray-900 border ${
                          status === "good" ? "border-green-500/20"
                          : status === "warning" ? "border-yellow-500/20"
                          : "border-red-500/20"
                        }`}>
                          <div className={`text-2xl font-black mb-1 ${
                            status === "good" ? "text-green-400"
                            : status === "warning" ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {contactInsights.hardBounceCount.toLocaleString()}
                          </div>
                          <p className="text-xs text-gray-400 font-medium">Hard bounces</p>
                          <p className="text-2xs text-gray-600 mt-1">
                            {pct}% del total · {status === "good" ? "Limpio ✅" : status === "warning" ? "Revisar ⚠️" : "Crítico 🔴"}
                          </p>
                        </div>
                      );
                    })()}

                    {/* Email inelegible */}
                    {(() => {
                      const pct = lifecycle.totalContacts > 0
                        ? Math.round((contactInsights.emailIneligibleCount / lifecycle.totalContacts) * 100)
                        : 0;
                      const status = pct < 5 ? "good" : pct < 15 ? "warning" : "alert";
                      return (
                        <div className={`p-4 rounded-xl bg-gray-900 border ${
                          status === "good" ? "border-green-500/20"
                          : status === "warning" ? "border-yellow-500/20"
                          : "border-red-500/20"
                        }`}>
                          <div className={`text-2xl font-black mb-1 ${
                            status === "good" ? "text-green-400"
                            : status === "warning" ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {contactInsights.emailIneligibleCount.toLocaleString()}
                          </div>
                          <p className="text-xs text-gray-400 font-medium">No aptos para email</p>
                          <p className="text-2xs text-gray-600 mt-1">
                            {pct}% del total · Opt-out o inelegibles
                          </p>
                        </div>
                      );
                    })()}

                    {/* Sin propietario (orphans) */}
                    {(() => {
                      const pct = lifecycle.totalContacts > 0
                        ? Math.round((contactInsights.orphanContactsCount / lifecycle.totalContacts) * 100)
                        : 0;
                      const status = pct < 10 ? "good" : pct < 30 ? "warning" : "alert";
                      return (
                        <div className={`p-4 rounded-xl bg-gray-900 border ${
                          status === "good" ? "border-green-500/20"
                          : status === "warning" ? "border-yellow-500/20"
                          : "border-red-500/20"
                        }`}>
                          <div className={`text-2xl font-black mb-1 ${
                            status === "good" ? "text-green-400"
                            : status === "warning" ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {contactInsights.orphanContactsCount.toLocaleString()}
                          </div>
                          <p className="text-xs text-gray-400 font-medium">Sin propietario</p>
                          <p className="text-2xs text-gray-600 mt-1">
                            {pct}% · Contactos huérfanos
                          </p>
                        </div>
                      );
                    })()}

                    {/* Con conversiones */}
                    {(() => {
                      const pct = lifecycle.totalContacts > 0
                        ? Math.round((contactInsights.withConversionsCount / lifecycle.totalContacts) * 100)
                        : 0;
                      const status = pct >= 30 ? "good" : pct >= 10 ? "warning" : "alert";
                      return (
                        <div className={`p-4 rounded-xl bg-gray-900 border ${
                          status === "good" ? "border-green-500/20"
                          : status === "warning" ? "border-yellow-500/20"
                          : "border-red-500/20"
                        }`}>
                          <div className={`text-2xl font-black mb-1 ${
                            status === "good" ? "text-green-400"
                            : status === "warning" ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {contactInsights.withConversionsCount.toLocaleString()}
                          </div>
                          <p className="text-xs text-gray-400 font-medium">Con conversiones</p>
                          <p className="text-2xs text-gray-600 mt-1">
                            {pct}% · Han completado formularios
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </section>

                {/* ── Actividad reciente ── */}
                <section>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                    Actividad reciente de contactos
                  </h2>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Activos últimos 30 días */}
                    {(() => {
                      const pct = lifecycle.totalContacts > 0
                        ? Math.round((contactInsights.active30dCount / lifecycle.totalContacts) * 100)
                        : 0;
                      return (
                        <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                          <div className="text-3xl font-black text-green-400 mb-1">
                            {contactInsights.active30dCount.toLocaleString()}
                          </div>
                          <p className="text-xs text-white font-medium">Activos últimos 30 días</p>
                          <p className="text-2xs text-gray-600 mt-1">{pct}% de la base total</p>
                          <div className="mt-3 w-full bg-gray-800 rounded-full h-1.5">
                            <div
                              className="bg-green-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Activos últimos 90 días */}
                    {(() => {
                      const pct = lifecycle.totalContacts > 0
                        ? Math.round((contactInsights.active90dCount / lifecycle.totalContacts) * 100)
                        : 0;
                      return (
                        <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                          <div className="text-3xl font-black text-yellow-400 mb-1">
                            {contactInsights.active90dCount.toLocaleString()}
                          </div>
                          <p className="text-xs text-white font-medium">Activos últimos 90 días</p>
                          <p className="text-2xs text-gray-600 mt-1">{pct}% de la base total</p>
                          <div className="mt-3 w-full bg-gray-800 rounded-full h-1.5">
                            <div
                              className="bg-yellow-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Nunca contactados */}
                    {(() => {
                      const pct = lifecycle.totalContacts > 0
                        ? Math.round((contactInsights.neverContactedCount / lifecycle.totalContacts) * 100)
                        : 0;
                      const status = pct < 20 ? "good" : pct < 50 ? "warning" : "alert";
                      return (
                        <div className={`p-5 rounded-xl bg-gray-900 border ${
                          status === "good" ? "border-green-500/20"
                          : status === "warning" ? "border-yellow-500/20"
                          : "border-red-500/20"
                        }`}>
                          <div className={`text-3xl font-black mb-1 ${
                            status === "good" ? "text-green-400"
                            : status === "warning" ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {contactInsights.neverContactedCount.toLocaleString()}
                          </div>
                          <p className="text-xs text-white font-medium">Nunca contactados</p>
                          <p className="text-2xs text-gray-600 mt-1">{pct}% sin actividad registrada</p>
                          <div className="mt-3 w-full bg-gray-800 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${
                                status === "good" ? "bg-green-500"
                                : status === "warning" ? "bg-yellow-500" : "bg-red-500"
                              }`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </section>
              </>
            )}

            {/* Scopes disponibles */}
            {details?.scopes && details.scopes.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Scopes OAuth autorizados
                </h2>
                <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
                  <div className="flex flex-wrap gap-1.5">
                    {details.scopes.map((s) => (
                      <span key={s} className="text-2xs px-2 py-0.5 rounded font-mono bg-gray-800 text-gray-400 border border-gray-700/50">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* ════════════════ ARQUITECTURA ════════════════════════════════ */}
        {activeTab === "arquitectura" && (
          <>
            {/* ── Objetos predeterminados ── */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Objetos predeterminados
                </h2>
                <span className="text-2xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">
                  {STD_OBJECTS.length}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {STD_OBJECTS.map((obj) => {
                  const propCount = state.properties[obj.key]?.length ?? 0;
                  return (
                    <button
                      key={obj.key}
                      onClick={() => openPropertiesFor(obj.key, obj.label)}
                      className="p-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors text-left group"
                    >
                      <span className="text-2xl mb-2 block">{obj.icon}</span>
                      <p className="text-sm font-semibold text-white group-hover:text-brand-light transition-colors">
                        {obj.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {propCount} propiedades
                      </p>
                      <p className="text-xs text-brand/60 mt-2 group-hover:text-brand-light transition-colors">
                        Ver propiedades →
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── Objetos personalizados ── */}
            <section>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Objetos personalizados
                </h2>
                <span className="text-2xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">
                  {state.customObjects.length}
                </span>
              </div>
              {state.customObjects.length === 0 ? (
                <EmptyState text="No hay objetos personalizados configurados en este portal" />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {state.customObjects.map((obj) => (
                    <button
                      key={obj.id}
                      onClick={() =>
                        setPropertiesModal({ label: obj.labels.plural, properties: obj.properties })
                      }
                      className="p-4 rounded-xl bg-gray-900 border border-purple-500/20 hover:border-purple-500/40 transition-colors text-left group"
                    >
                      <span className="text-2xl mb-2 block">🏗️</span>
                      <p className="text-sm font-semibold text-white group-hover:text-purple-400 transition-colors">
                        {obj.labels.plural}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {obj.properties.length} propiedades
                      </p>
                      {obj.primaryDisplayProperty && (
                        <p className="text-2xs text-gray-700 mt-0.5 truncate">
                          Display: {obj.primaryDisplayProperty}
                        </p>
                      )}
                      <p className="text-xs text-purple-500/60 mt-2 group-hover:text-purple-400 transition-colors">
                        Ver propiedades →
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* ── Propiedades por objeto ── */}
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Propiedades por objeto
              </h2>
              <div className="grid md:grid-cols-2 gap-3">
                {STD_OBJECTS.map((obj) => {
                  const props = state.properties[obj.key] ?? [];
                  return (
                    <div key={obj.key} className="p-4 rounded-xl bg-gray-900 border border-gray-800">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span>{obj.icon}</span>
                          <span className="text-sm font-medium text-white">{obj.label}</span>
                        </div>
                        <button
                          onClick={() => openPropertiesFor(obj.key, obj.label)}
                          className="text-xs text-brand-light/70 hover:text-brand-light transition-colors"
                        >
                          Ver todas ({props.length}) →
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {props.slice(0, 16).map((p) => (
                          <span
                            key={p.name}
                            className="text-2xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700/60 text-gray-400"
                          >
                            {p.name}
                          </span>
                        ))}
                        {props.length > 16 && (
                          <button
                            onClick={() => openPropertiesFor(obj.key, obj.label)}
                            className="text-2xs px-2 py-0.5 rounded bg-gray-800 border border-dashed border-gray-700 text-gray-600 hover:text-brand-light hover:border-brand/30 transition-colors"
                          >
                            +{props.length - 16} más
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {state.customObjects.map((obj) => (
                  <div key={obj.id} className="p-4 rounded-xl bg-gray-900 border border-purple-500/10">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span>🏗️</span>
                        <span className="text-sm font-medium text-white">{obj.labels.plural}</span>
                        <span className="text-2xs text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
                          Custom
                        </span>
                      </div>
                      <button
                        onClick={() => setPropertiesModal({ label: obj.labels.plural, properties: obj.properties })}
                        className="text-xs text-purple-400/70 hover:text-purple-400 transition-colors"
                      >
                        Ver todas ({obj.properties.length}) →
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {obj.properties.slice(0, 16).map((p) => (
                        <span
                          key={p.name}
                          className="text-2xs px-2 py-0.5 rounded bg-gray-800 border border-purple-500/10 text-gray-400"
                        >
                          {p.name}
                        </span>
                      ))}
                      {obj.properties.length > 16 && (
                        <button
                          onClick={() => setPropertiesModal({ label: obj.labels.plural, properties: obj.properties })}
                          className="text-2xs px-2 py-0.5 rounded bg-gray-800 border border-dashed border-purple-500/20 text-gray-600 hover:text-purple-400 transition-colors"
                        >
                          +{obj.properties.length - 16} más
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Ciclo de vida */}
            {lifecycle && (
              <section>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Etapa del ciclo de vida
                </h2>

                <div className={`grid gap-4 ${hasCompanies ? "md:grid-cols-2" : ""}`}>
                  {/* Contactos */}
                  <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-sm font-semibold text-white">
                        👤 Contactos
                      </span>
                      <span className="text-xs text-gray-500">
                        {lifecycle.totalContacts.toLocaleString()} total en CRM
                      </span>
                    </div>
                    {contactStages.length > 0 ? (
                      <HorizontalBarChart stages={contactStages} color="orange" />
                    ) : (
                      <p className="text-xs text-gray-600">
                        No hay contactos con etapa de ciclo de vida asignada
                      </p>
                    )}
                  </div>

                  {/* Empresas (B2B only) */}
                  {hasCompanies && (
                    <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
                      <div className="flex items-center justify-between mb-5">
                        <span className="text-sm font-semibold text-white">
                          🏢 Empresas
                        </span>
                        <span className="text-xs text-gray-500">
                          {lifecycle.totalCompanies.toLocaleString()} total en CRM
                        </span>
                      </div>
                      {companyStages.length > 0 ? (
                        <HorizontalBarChart stages={companyStages} color="blue" />
                      ) : (
                        <p className="text-xs text-gray-600">
                          Sin etapa de ciclo de vida asignada en empresas
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Automatización de etapas */}
                <div className="p-4 rounded-xl bg-gray-900 border border-gray-800 mt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Automatización de etapas
                  </p>
                  {lifecycle.lifecycleWorkflows.length > 0 ? (
                    <div className="space-y-2">
                      {lifecycle.lifecycleWorkflows.map((wf) => (
                        <div key={wf} className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                          <span className="text-xs text-gray-300">{wf}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600">
                      No se encontraron workflows de ciclo de vida activos
                      {state.workflows.length === 0
                        ? " — sin acceso a automatizaciones con los scopes actuales"
                        : ""}
                    </p>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {/* ════════════════ SEGMENTOS ═══════════════════════════════════ */}
        {activeTab === "segmentos" && (
          <>
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Segmentos dinámicos{" "}
                <span className="text-gray-600 normal-case font-normal ml-1">
                  {activeLists.length}
                </span>
              </h2>
              {activeLists.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-2">
                  {activeLists.map((list) => (
                    <div
                      key={list.listId}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 border border-gray-800"
                    >
                      <span className="w-2 h-2 rounded-full bg-green-500/80 shrink-0" />
                      <span className="text-sm text-gray-300 truncate">{list.name}</span>
                      <span className="ml-auto text-2xs text-gray-600 shrink-0 bg-gray-800 px-1.5 py-0.5 rounded">
                        Dinámico
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="No se encontraron segmentos dinámicos" />
              )}
            </section>

            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Segmentos estáticos{" "}
                <span className="text-gray-600 normal-case font-normal ml-1">
                  {staticLists.length}
                </span>
              </h2>
              {staticLists.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-2">
                  {staticLists.map((list) => (
                    <div
                      key={list.listId}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 border border-gray-800"
                    >
                      <span className="w-2 h-2 rounded-full bg-blue-500/80 shrink-0" />
                      <span className="text-sm text-gray-300 truncate">{list.name}</span>
                      <span className="ml-auto text-2xs text-gray-600 shrink-0 bg-gray-800 px-1.5 py-0.5 rounded">
                        Estático
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="No se encontraron segmentos estáticos" />
              )}
            </section>
          </>
        )}

        {/* ════════════════ PIPELINES ═══════════════════════════════════ */}
        {activeTab === "pipelines" && (
          <section>
            {/* Velocity summary */}
            {pipelineList.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20 text-center">
                  <p className="text-2xl font-black text-green-400">{activePipelines}</p>
                  <p className="text-xs text-gray-500 mt-1">Activos <span className="text-gray-700">(&lt;30d)</span></p>
                </div>
                <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-center">
                  <p className="text-2xl font-black text-yellow-400">{warningPipelines}</p>
                  <p className="text-xs text-gray-500 mt-1">Poco activos <span className="text-gray-700">(30–90d)</span></p>
                </div>
                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-center">
                  <p className="text-2xl font-black text-red-400">{inactivePipelines}</p>
                  <p className="text-xs text-gray-500 mt-1">Inactivos <span className="text-gray-700">(&gt;90d)</span></p>
                </div>
              </div>
            )}
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Detalle de pipelines
            </h2>
            {Object.values(state.pipelines).flat().length === 0 ? (
              <EmptyState text="No se encontraron pipelines" />
            ) : (
              <div className="space-y-3">
                {Object.entries(state.pipelines).map(([obj, pipes]) =>
                  pipes.map((pipe) => {
                    const activity = pipelineActivity[pipe.id];
                    return (
                      <div
                        key={pipe.id}
                        className="p-5 rounded-xl bg-gray-900 border border-gray-800"
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-brand-light bg-brand-light/10 border border-brand/20 px-2 py-0.5 rounded">
                              {obj}
                            </span>
                            <span className="text-sm font-semibold text-white">
                              {pipe.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {activity && (
                              <>
                                <span
                                  className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                                    ACTIVITY_COLORS[activity.activityColor]
                                  }`}
                                >
                                  {activity.activityLabel}
                                </span>
                                {activity.totalDeals > 0 && (
                                  <span className="text-2xs text-gray-500">
                                    {activity.totalDeals} deals
                                    {activity.avgDaysAgo !== null
                                      ? ` · prom. hace ${activity.avgDaysAgo}d`
                                      : ""}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Stages */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {pipe.stages.map((stage, si) => (
                            <div key={stage.id} className="flex items-center gap-2">
                              <span className="text-xs px-3 py-1 rounded-full bg-gray-800 border border-gray-700 text-gray-300">
                                {stage.label}
                              </span>
                              {si < pipe.stages.length - 1 && (
                                <svg
                                  className="w-3 h-3 text-gray-700 shrink-0"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5l7 7-7 7"
                                  />
                                </svg>
                              )}
                            </div>
                          ))}
                        </div>

                        {activity?.avgLastModifiedDate && (
                          <p className="text-2xs text-gray-600 mt-3">
                            Promedio últimos {Math.min(15, activity.totalDeals)} deals
                            actualizados: {fmtDate(activity.avgLastModifiedDate)}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>
        )}

        {/* ════════════════ AUTOMATIZACIONES ════════════════════════════ */}
        {activeTab === "automatizaciones" && (
          <section>
            {/* Effectiveness summary */}
            {state.workflows.length > 0 && workflowRate !== null && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20 text-center">
                  <p className="text-2xl font-black text-green-400">{enabledWorkflows}</p>
                  <p className="text-xs text-gray-500 mt-1">Workflows activos</p>
                </div>
                <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700 text-center">
                  <p className="text-2xl font-black text-gray-400">{state.workflows.length - enabledWorkflows}</p>
                  <p className="text-xs text-gray-500 mt-1">Inactivos / pausados</p>
                </div>
                <div className={`p-4 rounded-xl border text-center ${
                  workflowRate >= 70 ? "bg-green-500/5 border-green-500/20"
                  : workflowRate >= 40 ? "bg-yellow-500/5 border-yellow-500/20"
                  : "bg-red-500/5 border-red-500/20"
                }`}>
                  <p className={`text-2xl font-black ${
                    workflowRate >= 70 ? "text-green-400"
                    : workflowRate >= 40 ? "text-yellow-400" : "text-red-400"
                  }`}>{workflowRate}%</p>
                  <p className="text-xs text-gray-500 mt-1">Tasa de actividad</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Workflows{" "}
                <span className="text-gray-600 normal-case font-normal ml-1">
                  {state.workflows.length}
                </span>
              </h2>
              {state.workflows.length > 0 && (
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500" /> Activo
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-gray-700" /> Inactivo
                  </span>
                </div>
              )}
            </div>

            {state.workflows.length === 0 ? (
              <div className="p-5 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                <p className="text-sm font-semibold text-yellow-400">
                  Sin acceso a automatizaciones
                </p>
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  El portal no tiene workflows configurados, o los scopes actuales no
                  autorizan el acceso al endpoint{" "}
                  <code className="font-mono text-brand-light bg-gray-800 px-1 rounded">
                    /automation/v3/workflows
                  </code>
                  . Para habilitar el acceso, reconecta la cuenta con el scope{" "}
                  <code className="font-mono text-brand-light bg-gray-800 px-1 rounded">
                    automation
                  </code>
                  .
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {state.workflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 border border-gray-800"
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        wf.enabled ? "bg-green-500" : "bg-gray-700"
                      }`}
                    />
                    <span className="text-sm text-gray-300 flex-1 truncate">
                      {wf.name}
                    </span>
                    <span className="text-2xs text-gray-600 shrink-0 bg-gray-800 px-2 py-0.5 rounded">
                      {wf.type}
                    </span>
                  </div>
                ))}
                {workflowRate !== null && workflowRate < 60 && (
                  <div className="mt-3 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                    <p className="text-xs text-yellow-400 font-medium">💡 Consultoría: workflows inactivos</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {state.workflows.length - enabledWorkflows} workflows pausados — revisar si son obsoletos (eliminar)
                      o si deben reactivarse. Los &quot;workflows zombie&quot; son un antipatrón común en auditorías.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Secuencias */}
            {(state.sequences?.length > 0 || (state.accessErrors ?? {})["Secuencias"]) && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Secuencias (Sales Hub){" "}
                  <span className="text-gray-600 normal-case font-normal ml-1">
                    {state.sequences?.length ?? 0}
                  </span>
                </h3>
                {(state.accessErrors ?? {})["Secuencias"] ? (
                  <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-xs text-yellow-400">
                    Sin acceso: {(state.accessErrors ?? {})["Secuencias"]}
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-2">
                    {(state.sequences ?? []).map((seq) => (
                      <div key={seq.id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 border border-gray-800">
                        <span className="text-base">🔗</span>
                        <span className="text-sm text-gray-300 truncate">{seq.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ════════════════ MÁS ════════════════════════════════════════ */}
        {activeTab === "mas" && (
          <>
            {/* Formularios */}
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Formularios{" "}
                <span className="text-gray-600 normal-case font-normal ml-1">
                  {state.forms.length}
                </span>
              </h2>
              {state.forms.length === 0 ? (
                <EmptyState text="No se encontraron formularios" />
              ) : (
                <div className="grid md:grid-cols-2 gap-2">
                  {state.forms.map((form) => (
                    <div
                      key={form.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 border border-gray-800"
                    >
                      <span className="text-base">📝</span>
                      <span className="text-sm text-gray-300 flex-1 truncate">
                        {form.name}
                      </span>
                      <span className="text-2xs text-gray-600 shrink-0 bg-gray-800 px-2 py-0.5 rounded">
                        {form.formType}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Equipos */}
            {state.teams.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Equipos{" "}
                  <span className="text-gray-600 normal-case font-normal ml-1">
                    {state.teams.length}
                  </span>
                </h2>
                <div className="grid md:grid-cols-3 gap-2">
                  {state.teams.map((team) => (
                    <div
                      key={team.id}
                      className="px-4 py-3 rounded-lg bg-gray-900 border border-gray-800"
                    >
                      <p className="text-sm font-medium text-white">{team.name}</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {team.userIds.length} miembros
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Usuarios */}
            {state.users.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Usuarios{" "}
                  <span className="text-gray-600 normal-case font-normal ml-1">
                    {state.users.length}
                  </span>
                </h2>
                <div className="grid md:grid-cols-3 gap-2">
                  {state.users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-900 border border-gray-800"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs text-gray-400 font-semibold shrink-0">
                        {(user.firstName?.[0] ?? user.email[0]).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">
                          {user.firstName && user.lastName
                            ? `${user.firstName} ${user.lastName}`
                            : user.email}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ════════════════ SIN ACCESO ══════════════════════════════════ */}
        {activeTab === "sin-acceso" && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Datos sin acceso o sin configurar
            </h2>
            {noAccess.length === 0 ? (
              <div className="p-5 rounded-xl bg-green-500/5 border border-green-500/20 flex items-center gap-3">
                <span className="text-green-400 text-xl">✅</span>
                <p className="text-sm text-green-400">
                  Se tiene acceso a todos los recursos disponibles con los scopes
                  actuales.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {noAccess.map((item) => (
                  <div
                    key={item.feature}
                    className="p-5 rounded-xl bg-gray-900 border border-red-500/20"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-red-400 text-xl shrink-0">⚠️</span>
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {item.feature}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                          {item.reason}
                        </p>
                        <div className="mt-3">
                          <span className="text-2xs font-mono bg-gray-800 text-brand-light px-2 py-1 rounded">
                            scope requerido: {item.scope}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

      </div>
    </>
  );
}
