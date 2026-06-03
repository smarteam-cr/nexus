"use client";

/**
 * components/clients/ClientInfoPanel.tsx
 *
 * Panel "Información del cliente" (ex Canvas de Estrategia + ex drawer Contexto).
 *
 * Sub-tabs horizontales:
 *   - Documentos    → DocumentUpload (Supabase Storage del proyecto strategy)
 *   - Sesiones      → ClientSessionCards (sesiones del cliente filtradas)
 *   - Stakeholders  → SectionBlockList filtrado por key="stakeholders"
 *   - Retos         → idem key="retos_estrategicos"
 *   - Oportunidades → idem key="oportunidades"
 *
 * Internamente sigue siendo el Project con serviceType=__strategy__; cambian
 * los nombres de UI y las secciones del canvas se reducen a 3 (las otras 2
 * — handoff_ventas y perfil_cliente — se eliminaron en la migración).
 */
import { useState } from "react";
import { useParams } from "next/navigation";
import SectionBlockList from "@/components/canvas/SectionBlockList";
import DocumentUpload from "./DocumentUpload";
import ClientSessionCards from "./ClientSessionCards";

type SubTab = "docs" | "sesiones" | "stakeholders" | "retos" | "oportunidades";

const TABS: { key: SubTab; label: string }[] = [
  { key: "docs",          label: "Documentos" },
  { key: "sesiones",      label: "Sesiones" },
  { key: "stakeholders",  label: "Stakeholders" },
  { key: "retos",         label: "Retos estratégicos" },
  { key: "oportunidades", label: "Oportunidades" },
];

export default function ClientInfoPanel({
  projectId,
  canvasId,
  domain,
  company,
}: {
  projectId: string;
  canvasId: string;
  domain?: string;
  company?: string;
}) {
  const params = useParams();
  const clientId = (params?.id as string) ?? "";
  const [tab, setTab] = useState<SubTab>("docs");

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Información del cliente</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Documentos, sesiones y contexto estratégico del cliente.
          </p>
        </div>
        {clientId && (
          <a
            href={`/print/canvas/${clientId}/${canvasId}?print=1&projectId=${projectId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:border-gray-700"
            title="Abre una vista imprimible de las secciones del canvas"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Exportar PDF
          </a>
        )}
      </div>

      {/* Sub-tabs horizontales */}
      <div className="flex gap-0 border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-brand text-white"
                : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido del sub-tab activo */}
      <div className="pt-2">
        {tab === "docs" && <DocumentUpload projectId={projectId} />}

        {tab === "sesiones" && (
          <ClientSessionCards
            clientId={clientId}
            domain={domain}
            company={company}
            filterMode="name"
          />
        )}

        {tab === "stakeholders" && (
          <SectionBlockList projectId={projectId} canvasId={canvasId} onlyKey="stakeholders" />
        )}

        {tab === "retos" && (
          <SectionBlockList projectId={projectId} canvasId={canvasId} onlyKey="retos_estrategicos" />
        )}

        {tab === "oportunidades" && (
          <SectionBlockList projectId={projectId} canvasId={canvasId} onlyKey="oportunidades" />
        )}
      </div>
    </div>
  );
}
