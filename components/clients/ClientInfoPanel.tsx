"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import ClientDocuments from "./ClientDocuments";
import ClientDealInfo from "./ClientDealInfo";

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
}

// ── Mapeos legibles ───────────────────────────────────────────────────────────

const LIFECYCLE_LABELS: Record<string, string> = {
  subscriber: "Suscriptor",
  lead: "Lead",
  marketingqualifiedlead: "MQL",
  salesqualifiedlead: "SQL",
  opportunity: "Oportunidad",
  customer: "Cliente",
  evangelist: "Evangelizador",
  other: "Otro",
};

const LIFECYCLE_COLORS: Record<string, string> = {
  customer:            "text-green-400 bg-green-500/10 border-green-500/20",
  opportunity:         "text-blue-400 bg-blue-500/10 border-blue-500/20",
  salesqualifiedlead:  "text-purple-400 bg-purple-500/10 border-purple-500/20",
  marketingqualifiedlead: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  lead:                "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  subscriber:          "text-gray-400 bg-gray-800 border-gray-700",
};

// Mapa de industrias HubSpot → etiqueta legible
const INDUSTRY_LABELS: Record<string, string> = {
  ACCOUNTING: "Contabilidad",
  ALTERNATIVE_DISPUTE_RESOLUTION: "Resolución de Disputas",
  ALTERNATIVE_MEDICINE: "Medicina Alternativa",
  ANIMATION: "Animación",
  APPAREL_FASHION: "Moda y Ropa",
  ARCHITECTURE_PLANNING: "Arquitectura",
  AUTOMOTIVE: "Automotriz",
  BANKING: "Banca",
  BIOTECHNOLOGY: "Biotecnología",
  BROADCAST_MEDIA: "Medios de Comunicación",
  CAPITAL_MARKETS: "Mercados de Capital",
  CHEMICALS: "Química",
  CIVIL_ENGINEERING: "Ingeniería Civil",
  COMPUTER_GAMES: "Videojuegos",
  COMPUTER_HARDWARE: "Hardware",
  COMPUTER_NETWORK_SECURITY: "Seguridad de Redes",
  COMPUTER_SOFTWARE: "Software",
  CONSTRUCTION: "Construcción",
  CONSUMER_ELECTRONICS: "Electrónica",
  CONSUMER_GOODS: "Bienes de Consumo",
  CONSUMER_SERVICES: "Servicios al Consumidor",
  DESIGN: "Diseño",
  EDUCATION_MANAGEMENT: "Educación",
  E_LEARNING: "E-Learning",
  ENTERTAINMENT: "Entretenimiento",
  EVENTS_SERVICES: "Eventos",
  FINANCIAL_SERVICES: "Servicios Financieros",
  FOOD_BEVERAGES: "Alimentos y Bebidas",
  GOVERNMENT_ADMINISTRATION: "Administración Pública",
  GRAPHIC_DESIGN: "Diseño Gráfico",
  HEALTH_WELLNESS_FITNESS: "Salud y Bienestar",
  HIGHER_EDUCATION: "Educación Superior",
  HOSPITAL_HEALTH_CARE: "Salud",
  HOSPITALITY: "Hospitalidad",
  HUMAN_RESOURCES: "Recursos Humanos",
  INFORMATION_TECHNOLOGY_SERVICES: "Tecnología de la Información",
  INSURANCE: "Seguros",
  INTERNET: "Internet",
  INVESTMENT_BANKING: "Banca de Inversión",
  INVESTMENT_MANAGEMENT: "Gestión de Inversiones",
  LAW_PRACTICE: "Práctica Legal",
  LEGAL_SERVICES: "Servicios Legales",
  LEISURE_TRAVEL_TOURISM: "Turismo",
  LOGISTICS_SUPPLY_CHAIN: "Logística",
  LUXURY_GOODS_JEWELRY: "Lujo y Joyería",
  MANAGEMENT_CONSULTING: "Consultoría",
  MARKET_RESEARCH: "Investigación de Mercado",
  MARKETING_ADVERTISING: "Marketing y Publicidad",
  MECHANICAL_OR_INDUSTRIAL_ENGINEERING: "Ingeniería Industrial",
  MEDICAL_DEVICES: "Dispositivos Médicos",
  NONPROFIT_ORGANIZATION_MANAGEMENT: "ONG",
  OIL_ENERGY: "Petróleo y Energía",
  PHARMACEUTICALS: "Farmacéutica",
  PROFESSIONAL_TRAINING_COACHING: "Coaching y Formación",
  PUBLIC_RELATIONS_COMMUNICATIONS: "Relaciones Públicas",
  PUBLISHING: "Editorial",
  REAL_ESTATE: "Bienes Raíces",
  RENEWABLES_ENVIRONMENT: "Energías Renovables",
  RESEARCH: "Investigación",
  RESTAURANTS: "Restaurantes",
  RETAIL: "Retail",
  SECURITY_INVESTIGATIONS: "Seguridad",
  STAFFING_RECRUITING: "Reclutamiento",
  TELECOMMUNICATIONS: "Telecomunicaciones",
  TRANSPORTATION_TRUCKING_RAILROAD: "Transporte",
  INFORMATION_SERVICES: "Servicios de Información",
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function ClientInfoPanel({
  clientId,
  hasHubspot,
  hubspotCompanyId,
  hubName,
  hubspotPortalId,
}: Props) {
  const pathname = usePathname();
  const [docCount, setDocCount] = useState<number | null>(null);
  const [hubDetails, setHubDetails] = useState<HubspotDetails | null>(null);
  const [loadingHub, setLoadingHub] = useState(false);

  // Detectar si estamos dentro de un proyecto (/clients/[id]/projects/[projectId]/...)
  const projectIdMatch = pathname.match(/\/projects\/([^/]+)/);
  const currentProjectId = projectIdMatch?.[1] ?? null;

  // Hay datos de HubSpot si tiene cuenta propia O si fue importado con hubspotCompanyId
  const hasHubspotData = hasHubspot || !!hubspotCompanyId;

  const fetchHubDetails = () => {
    if (!hasHubspotData) return;
    setLoadingHub(true);
    fetch(`/api/clients/${clientId}/hubspot-info`)
      .then((r) => r.json())
      .then((data: HubspotDetails) => setHubDetails(data))
      .catch(() => setHubDetails({ connected: true, hubName, hubspotPortalId }))
      .finally(() => setLoadingHub(false));
  };

  // Fetch detalles HubSpot al montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchHubDetails(); }, []);

  return (
    <div className="border-b border-gray-800 bg-gray-950">
      <div className={`px-5 py-3 ${currentProjectId ? "grid gap-6 lg:grid-cols-3" : ""}`}>
        {/* ── Documentos del proyecto (solo cuando estamos dentro de un proyecto) ── */}
        {currentProjectId && (
          <div>
            <SectionLabel
              icon="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              label={`Documentos${docCount ? ` (${docCount})` : ""}`}
            />
            <ClientDocuments
              clientId={clientId}
              projectId={currentProjectId}
              global
              onCountChange={setDocCount}
            />
          </div>
        )}

        {/* ── Info del portal HubSpot ── */}
        <div>
          <SectionLabel icon="M13 10V3L4 14h7v7l9-11h-7z" label="HubSpot" />

          {!hasHubspotData ? (
            /* Estado: sin datos de HubSpot en absoluto */
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                  No conectado
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Conecta HubSpot para acceder a auditorías, datos del portal y análisis del funnel.
              </p>
              <a
                href={`/clients/${clientId}/settings`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand/10 border border-brand/30 text-brand-light hover:bg-brand/20 text-xs font-medium transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Conectar HubSpot
              </a>
            </div>
          ) : loadingHub ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" />
              Buscando empresa en HubSpot...
            </div>
          ) : (
            <div className="space-y-3">
              {/* Datos de empresa */}
              {hubDetails?.hubspotCompany && (
                <CompanyDataRow company={hubDetails.hubspotCompany} />
              )}

              {/* Chips del portal */}
              <div className="flex flex-wrap gap-1.5">
                {/* Badge "vía sistema" si los datos vienen de la cuenta del sistema */}
                {hubDetails?.source === "system" && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs">
                    <span className="text-gray-500">Fuente:</span>
                    <span className="text-gray-400">cuenta Dinterweb</span>
                  </span>
                )}
                {(hubDetails?.hubName ?? hubName) && (
                  <InfoChip label="Hub" value={hubDetails?.hubName ?? hubName!} />
                )}
                {(hubDetails?.hubspotPortalId ?? hubspotPortalId) && (
                  <InfoChip
                    label="Portal"
                    value={`#${hubDetails?.hubspotPortalId ?? hubspotPortalId}`}
                    mono
                  />
                )}
                {hubDetails?.timeZone && (
                  <InfoChip label="TZ" value={hubDetails.timeZone} />
                )}
                {hubDetails?.companyCurrency && (
                  <InfoChip label="Moneda" value={hubDetails.companyCurrency} />
                )}
                {hubDetails?.dataHostingLocation && (
                  <InfoChip
                    label="Región"
                    value={hubDetails.dataHostingLocation.toUpperCase()}
                  />
                )}
              </div>

              {/* Acciones */}
              {hubDetails?.hubspotCompanyUrl && (
                <a
                  href={hubDetails.hubspotCompanyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-2xs text-gray-500 hover:text-gray-300 transition-colors"
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

        {/* ── Lo que se vendió (solo dentro de un proyecto) ── */}
        {currentProjectId && (
          <div>
            <SectionLabel
              icon="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
              label="Lo que se vendió"
            />
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
  );
}

// ── CompanyDataRow: chips de datos de la empresa ──────────────────────────────

function CompanyDataRow({ company }: { company: HubspotCompanyProps }) {
  const lifecycle = company.lifecyclestage?.toLowerCase();
  const lifecycleLabel = lifecycle ? (LIFECYCLE_LABELS[lifecycle] ?? lifecycle) : null;
  const lifecycleColor = lifecycle
    ? (LIFECYCLE_COLORS[lifecycle] ?? "text-gray-400 bg-gray-800 border-gray-700")
    : "";

  const revenue = company.annualrevenue
    ? formatRevenue(company.annualrevenue)
    : null;

  const employees = company.numberofemployees
    ? `${parseInt(company.numberofemployees).toLocaleString()} empleados`
    : null;

  const location = [company.city, company.country].filter(Boolean).join(", ");

  return (
    <div className="flex flex-wrap gap-1.5">
      {/* Lifecycle stage — destacado */}
      {lifecycleLabel && (
        <span
          className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium ${lifecycleColor}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
          {lifecycleLabel}
        </span>
      )}

      {company.industry && (
        <InfoChip
          label="Industria"
          value={
            INDUSTRY_LABELS[company.industry] ??
            company.industry
              .replace(/_/g, " ")
              .toLowerCase()
              .replace(/\b\w/g, (c) => c.toUpperCase())
          }
        />
      )}

      {revenue && <InfoChip label="Revenue" value={revenue} />}

      {employees && <InfoChip label="Equipo" value={employees} />}

      {location && <InfoChip label="Ubicación" value={location} />}

      {company.phone && <InfoChip label="Tel" value={company.phone} />}

      {company.type && <InfoChip label="Tipo" value={company.type} />}

      {company.founded_year && (
        <InfoChip label="Fundada" value={company.founded_year} />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <p className="text-2xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
      <svg
        className="w-3 h-3 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={icon}
        />
      </svg>
      {label}
    </p>
  );
}

function InfoChip({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <span className="flex items-center gap-1 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs">
      <span className="text-gray-500">{label}:</span>
      <span className={`text-gray-200 ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
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
