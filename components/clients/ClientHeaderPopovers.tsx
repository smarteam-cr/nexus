"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import ClientDocuments from "./ClientDocuments";
import ClientDealInfo from "./ClientDealInfo";
import ClientSessionCards from "./ClientSessionCards";
import { getStageSteps } from "@/lib/steps";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HubspotCompanyProps {
  name?: string | null;
  domain?: string | null;
  industry?: string | null;
  annualrevenue?: string | null;
  numberofemployees?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  lifecyclestage?: string | null;
  hs_lead_status?: string | null;
  description?: string | null;
  type?: string | null;
  founded_year?: string | null;
}

interface HubspotDetails {
  connected: boolean;
  source?: "client" | "system";
  hubName?: string | null;
  hubspotPortalId?: string | null;
  timeZone?: string | null;
  dataHostingLocation?: string | null;
  companyCurrency?: string | null;
  hubspotCompanyId?: string | null;
  hubspotCompanyUrl?: string | null;
  hubspotCompany?: HubspotCompanyProps | null;
}

interface Props {
  clientId: string;
  hasHubspot: boolean;
  hubspotCompanyId: string | null;
  hubName: string | null;
  hubspotPortalId: string | null;
  serviceType?: string | null;
  domain?: string;
  company?: string;
}

type PopoverType = "documentos" | "empresa" | "deal" | "sesiones" | null;

// ── Mapeos legibles ───────────────────────────────────────────────────────────

const LIFECYCLE_LABELS: Record<string, string> = {
  subscriber: "Suscriptor", lead: "Lead", marketingqualifiedlead: "MQL",
  salesqualifiedlead: "SQL", opportunity: "Oportunidad", customer: "Cliente",
  evangelist: "Evangelizador", other: "Otro",
};
const LIFECYCLE_COLORS: Record<string, string> = {
  customer: "text-green-400 bg-green-500/10 border-green-500/20",
  opportunity: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  salesqualifiedlead: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  marketingqualifiedlead: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  lead: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  subscriber: "text-gray-400 bg-gray-800 border-gray-700",
};
const INDUSTRY_LABELS: Record<string, string> = {
  ACCOUNTING: "Contabilidad", ALTERNATIVE_MEDICINE: "Medicina Alternativa",
  ANIMATION: "Animación", APPAREL_FASHION: "Moda y Ropa",
  ARCHITECTURE_PLANNING: "Arquitectura", AUTOMOTIVE: "Automotriz",
  BANKING: "Banca", BIOTECHNOLOGY: "Biotecnología",
  BROADCAST_MEDIA: "Medios", CAPITAL_MARKETS: "Mercados de Capital",
  CHEMICALS: "Química", CIVIL_ENGINEERING: "Ingeniería Civil",
  COMPUTER_GAMES: "Videojuegos", COMPUTER_HARDWARE: "Hardware",
  COMPUTER_NETWORK_SECURITY: "Seguridad de Redes", COMPUTER_SOFTWARE: "Software",
  CONSTRUCTION: "Construcción", CONSUMER_ELECTRONICS: "Electrónica",
  CONSUMER_GOODS: "Bienes de Consumo", CONSUMER_SERVICES: "Servicios al Consumidor",
  DESIGN: "Diseño", EDUCATION_MANAGEMENT: "Educación", E_LEARNING: "E-Learning",
  ENTERTAINMENT: "Entretenimiento", EVENTS_SERVICES: "Eventos",
  FINANCIAL_SERVICES: "Servicios Financieros", FOOD_BEVERAGES: "Alimentos y Bebidas",
  GOVERNMENT_ADMINISTRATION: "Administración Pública", GRAPHIC_DESIGN: "Diseño Gráfico",
  HEALTH_WELLNESS_FITNESS: "Salud y Bienestar", HIGHER_EDUCATION: "Educación Superior",
  HOSPITAL_HEALTH_CARE: "Salud", HOSPITALITY: "Hospitalidad",
  HUMAN_RESOURCES: "Recursos Humanos",
  INFORMATION_TECHNOLOGY_SERVICES: "Tecnología de la Información",
  INSURANCE: "Seguros", INTERNET: "Internet",
  INVESTMENT_BANKING: "Banca de Inversión", INVESTMENT_MANAGEMENT: "Gestión de Inversiones",
  LAW_PRACTICE: "Práctica Legal", LEGAL_SERVICES: "Servicios Legales",
  LEISURE_TRAVEL_TOURISM: "Turismo", LOGISTICS_SUPPLY_CHAIN: "Logística",
  LUXURY_GOODS_JEWELRY: "Lujo y Joyería", MANAGEMENT_CONSULTING: "Consultoría",
  MARKET_RESEARCH: "Investigación de Mercado",
  MARKETING_ADVERTISING: "Marketing y Publicidad",
  MECHANICAL_OR_INDUSTRIAL_ENGINEERING: "Ingeniería Industrial",
  MEDICAL_DEVICES: "Dispositivos Médicos",
  NONPROFIT_ORGANIZATION_MANAGEMENT: "ONG", OIL_ENERGY: "Petróleo y Energía",
  PHARMACEUTICALS: "Farmacéutica", PROFESSIONAL_TRAINING_COACHING: "Coaching y Formación",
  PUBLIC_RELATIONS_COMMUNICATIONS: "Relaciones Públicas", PUBLISHING: "Editorial",
  REAL_ESTATE: "Bienes Raíces", RENEWABLES_ENVIRONMENT: "Energías Renovables",
  RESEARCH: "Investigación", RESTAURANTS: "Restaurantes", RETAIL: "Retail",
  SECURITY_INVESTIGATIONS: "Seguridad", STAFFING_RECRUITING: "Reclutamiento",
  TELECOMMUNICATIONS: "Telecomunicaciones",
  TRANSPORTATION_TRUCKING_RAILROAD: "Transporte",
  INFORMATION_SERVICES: "Servicios de Información",
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function ClientHeaderPopovers({
  clientId, hasHubspot, hubspotCompanyId, hubName, hubspotPortalId,
  serviceType, domain, company,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState<PopoverType>(null);
  const [docCount, setDocCount] = useState<number | null>(null);
  const [hubDetails, setHubDetails] = useState<HubspotDetails | null>(null);
  const [loadingHub, setLoadingHub] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Lazy-mount: se montan en el primer open y permanecen en DOM (keep-alive).
  // Segunda apertura = instantánea, sin re-fetch.
  const [mountedDocs, setMountedDocs] = useState(false);
  const [mountedDeal, setMountedDeal] = useState(false);
  const [mountedSessions, setMountedSessions] = useState(false);

  const projectIdMatch = pathname.match(/\/projects\/([^/]+)/);
  const currentProjectId = projectIdMatch?.[1] ?? null;

  // Derivar keywords y preselectRole del step actual (para filtrar sesiones)
  const stageMatch = pathname.match(/\/stage\/(\d+)/);
  const currentStageNum = stageMatch ? parseInt(stageMatch[1]) : null;
  const currentStepIndex = parseInt(searchParams.get("step") ?? "0");
  const currentStepDef = (() => {
    if (!currentStageNum || !serviceType) return null;
    const stageSteps = getStageSteps(serviceType);
    const steps = stageSteps[currentStageNum];
    if (!steps) return null;
    const idx = Math.max(0, Math.min(steps.length - 1, currentStepIndex));
    return steps[idx] ?? null;
  })();
  const hasHubspotData = hasHubspot || !!hubspotCompanyId;

  // Fetch detalles HubSpot al montar
  useEffect(() => {
    if (!hasHubspotData) return;
    setLoadingHub(true);
    fetch(`/api/clients/${clientId}/hubspot-info`)
      .then((r) => r.json())
      .then((data: HubspotDetails) => setHubDetails(data))
      .catch(() => setHubDetails({ connected: true, hubName, hubspotPortalId }))
      .finally(() => setLoadingHub(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const toggle = (type: PopoverType) => {
    setOpen((prev) => (prev === type ? null : type));
    if (type === "documentos") setMountedDocs(true);
    if (type === "deal") setMountedDeal(true);
    if (type === "sesiones") setMountedSessions(true);
  };

  return (
    <div ref={wrapperRef} className="relative">
      {/* ── Botón único: Contexto ── */}
      <button
        onClick={() => { const def = currentProjectId ? "sesiones" : "empresa"; setOpen(open ? null : def); if (!open && def === "sesiones") setMountedSessions(true); }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
          open
            ? "text-white bg-gray-800 border-gray-700"
            : "text-gray-400 hover:text-gray-200 border-gray-800 hover:border-gray-700 hover:bg-gray-800/50"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Contexto
      </button>

      {/* ── Drawer lateral derecho ── */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(null)} />

          <div className="fixed right-0 top-0 h-full w-[480px] bg-gray-900 border-l border-gray-700/80 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header con tabs */}
            <div className="flex-shrink-0 border-b border-gray-800">
              <div className="flex items-center justify-between px-5 pt-4 pb-0">
                <div className="flex items-center gap-1">
                  {currentProjectId && (
                    <TabButton active={open === "sesiones"} onClick={() => toggle("sesiones")}>
                      Sesiones
                    </TabButton>
                  )}
                  {currentProjectId && (
                    <TabButton active={open === "documentos"} onClick={() => toggle("documentos")}>
                      {docCount ? `Docs (${docCount})` : "Docs"}
                    </TabButton>
                  )}
                  {currentProjectId && (
                    <TabButton active={open === "deal"} onClick={() => toggle("deal")}>
                      Deal
                    </TabButton>
                  )}
                  <TabButton active={open === "empresa"} onClick={() => toggle("empresa")}>
                    Empresa
                  </TabButton>
                </div>
                <button
                  onClick={() => setOpen(null)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

          <div className="flex-1 overflow-y-auto p-5">
            {/* ── Documentos — lazy-mount, keep-alive ── */}
            {mountedDocs && currentProjectId && (
              <div className={open === "documentos" ? "" : "hidden"}>
                <ClientDocuments
                  clientId={clientId}
                  projectId={currentProjectId}
                  global
                  onCountChange={setDocCount}
                />
              </div>
            )}

            {/* ── Empresa (HubSpot) ── */}
            {open === "empresa" && (
              <div className="space-y-4">
                {!hasHubspotData ? (
                  <div className="space-y-3">
                    <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700 w-fit">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                      No conectado
                    </span>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Conecta HubSpot para acceder a datos del portal y análisis.
                    </p>
                    <a
                      href={`/clients/${clientId}/settings`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 border border-brand/30 text-brand-light hover:bg-brand/20 text-xs font-medium transition-colors"
                    >
                      Conectar HubSpot
                    </a>
                  </div>
                ) : loadingHub ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                    <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" />
                    Cargando datos de empresa...
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Datos de empresa */}
                    {hubDetails?.hubspotCompany && (
                      <CompanyDataSection company={hubDetails.hubspotCompany} />
                    )}

                    {/* Chips del portal */}
                    <div>
                      <p className="text-2xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Portal</p>
                      <div className="flex flex-wrap gap-1.5">
                        {hubDetails?.source === "system" && (
                          <InfoChip label="Fuente" value="cuenta Dinterweb" />
                        )}
                        {(hubDetails?.hubName ?? hubName) && (
                          <InfoChip label="Hub" value={hubDetails?.hubName ?? hubName!} />
                        )}
                        {(hubDetails?.hubspotPortalId ?? hubspotPortalId) && (
                          <InfoChip label="Portal" value={`#${hubDetails?.hubspotPortalId ?? hubspotPortalId}`} mono />
                        )}
                        {hubDetails?.timeZone && (
                          <InfoChip label="TZ" value={hubDetails.timeZone} />
                        )}
                        {hubDetails?.companyCurrency && (
                          <InfoChip label="Moneda" value={hubDetails.companyCurrency} />
                        )}
                        {hubDetails?.dataHostingLocation && (
                          <InfoChip label="Región" value={hubDetails.dataHostingLocation.toUpperCase()} />
                        )}
                      </div>
                    </div>

                    {/* Link empresa */}
                    {hubDetails?.hubspotCompanyUrl && (
                      <a
                        href={hubDetails.hubspotCompanyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Ver empresa en HubSpot
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Sesiones — re-mount on step change for fresh keywords ── */}
            {open === "sesiones" && currentProjectId && (
              <ClientSessionCards
                key={`sessions-${currentStageNum}-${currentStepIndex}`}
                clientId={clientId}
                domain={domain}
                company={company}
                filterMode="name"
                defaultTags={currentStepDef?.keywords?.length ? currentStepDef.keywords : undefined}
                preselectRole={currentStepDef?.preselectRole}
              />
            )}

            {/* ── Deal — lazy-mount, keep-alive ── */}
            {mountedDeal && currentProjectId && (
              <div className={open === "deal" ? "" : "hidden"}>
                <ClientDealInfo
                  clientId={clientId}
                  projectId={currentProjectId}
                  hideHeader
                  portalId={hubDetails?.hubspotPortalId ?? hubspotPortalId}
                />
              </div>
            )}
          </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────

function TabButton({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
        active
          ? "text-white border-brand"
          : "text-gray-500 hover:text-gray-300 border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

function CompanyDataSection({ company }: { company: HubspotCompanyProps }) {
  const lifecycle = company.lifecyclestage?.toLowerCase();
  const lifecycleLabel = lifecycle ? (LIFECYCLE_LABELS[lifecycle] ?? lifecycle) : null;
  const lifecycleColor = lifecycle
    ? (LIFECYCLE_COLORS[lifecycle] ?? "text-gray-400 bg-gray-800 border-gray-700")
    : "";
  const revenue = company.annualrevenue ? formatRevenue(company.annualrevenue) : null;
  const employees = company.numberofemployees
    ? `${parseInt(company.numberofemployees).toLocaleString()} empleados`
    : null;
  const location = [company.city, company.country].filter(Boolean).join(", ");

  return (
    <div>
      <p className="text-2xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Empresa</p>
      <div className="flex flex-wrap gap-1.5">
        {lifecycleLabel && (
          <span className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium ${lifecycleColor}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
            {lifecycleLabel}
          </span>
        )}
        {company.industry && (
          <InfoChip
            label="Industria"
            value={INDUSTRY_LABELS[company.industry] ?? company.industry.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
          />
        )}
        {revenue && <InfoChip label="Revenue" value={revenue} />}
        {employees && <InfoChip label="Equipo" value={employees} />}
        {location && <InfoChip label="Ubicación" value={location} />}
        {company.phone && <InfoChip label="Tel" value={company.phone} />}
        {company.founded_year && <InfoChip label="Fundada" value={company.founded_year} />}
      </div>
    </div>
  );
}

function InfoChip({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="flex items-center gap-1 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs">
      <span className="text-gray-500">{label}:</span>
      <span className={`text-gray-200 ${mono ? "font-mono" : ""}`}>{value}</span>
    </span>
  );
}

function formatRevenue(raw: string): string {
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num}`;
}
