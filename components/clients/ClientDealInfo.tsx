"use client";

import { useState, useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui";

interface LineItem {
  id: string;
  name: string;
  quantity: string | null;
  price: string | null;
  amount: string | null;
  hs_sku: string | null;
  description: string | null;
}

interface DealInfo {
  id: string;
  name: string;
  amount: string | null;
  closedate: string | null;
}

interface AvailableDeal {
  id: string;
  name: string;
  amount: string | null;
  closedate: string | null;
  isWon: boolean;
}

type ServiceType = "loop_marketing" | "loop_sales" | "loop_service" | "proyecto_temporal";

const SERVICE_TYPE_META: Record<ServiceType, { label: string; color: string }> = {
  loop_marketing:    { label: "Loop Marketing",    color: "bg-sky-50 text-sky-700 border-sky-200" },
  loop_sales:        { label: "Loop Sales",        color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  loop_service:      { label: "Loop Service",      color: "bg-violet-50 text-violet-700 border-violet-200" },
  proyecto_temporal: { label: "Proyecto temporal", color: "bg-gray-100 text-gray-600 border-gray-200" },
};

const formatCurrency = (val: string | null) => {
  if (!val) return null;
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  return n.toLocaleString("es-CR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
};

interface Props {
  clientId: string;
  projectId: string;
  savedServiceType?: string | null;
  compact?: boolean;
  hideHeader?: boolean;
  portalId?: string | null;
}

export default function ClientDealInfo({ clientId, projectId, savedServiceType, compact, hideHeader, portalId }: Props) {
  const [deal, setDeal] = useState<DealInfo | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceType | null>(
    (savedServiceType as ServiceType) ?? null
  );
  const [availableDeals, setAvailableDeals] = useState<AvailableDeal[]>([]);
  const [loadingDeal, setLoadingDeal] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [changingDeal, setChangingDeal] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoadingDeal(true);
    fetch(`/api/clients/${clientId}/deal-line-items?projectId=${projectId}`)
      .then((r) => r.json())
      .then((dealData) => {
        setDeal(dealData.deal ?? null);
        setLineItems(dealData.lineItems ?? []);
        setAvailableDeals(dealData.availableDeals ?? []);
        const detected = dealData.serviceType as ServiceType | null;
        if (detected) {
          setServiceType(detected);
          if (!savedServiceType) {
            fetch(`/api/clients/${clientId}/projects/${projectId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ serviceType: detected }),
            }).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDeal(false));
  }, [clientId, projectId, savedServiceType]);

  // Cerrar selector al hacer clic fuera
  useEffect(() => {
    if (!showSelector) return;
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setShowSelector(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSelector]);

  const handleChangeDeal = async (newDealId: string) => {
    if (newDealId === deal?.id) { setShowSelector(false); return; }
    setChangingDeal(true);
    setShowSelector(false);
    try {
      // Guardar en el proyecto
      await fetch(`/api/clients/${clientId}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hubspotDealId: newDealId }),
      });
      // Recargar datos del nuevo deal
      const res = await fetch(`/api/clients/${clientId}/deal-line-items?projectId=${projectId}`);
      const dealData = await res.json();
      setDeal(dealData.deal ?? null);
      setLineItems(dealData.lineItems ?? []);
      const detected = dealData.serviceType as ServiceType | null;
      if (detected) setServiceType(detected);
    } catch {
      // silencioso
    } finally {
      setChangingDeal(false);
    }
  };

  // ── Modo compacto (para barra de tabs) ───────────────────────────────────────
  if (compact) {
    const meta = serviceType ? SERVICE_TYPE_META[serviceType] : null;
    return (
      <div className="relative flex items-center" ref={selectorRef}>
        {loadingDeal && (
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className="w-20 h-4 bg-gray-800 rounded-full animate-pulse" />
          </div>
        )}

        {!loadingDeal && (serviceType || deal) && (
          <button
            onClick={() => setShowSelector((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-800/60 transition-colors"
          >
            {meta && (
              <span className={`px-2 py-0.5 rounded-full text-2xs font-semibold border ${meta.color}`}>
                {meta.label}
              </span>
            )}
            {deal && (
              <span className="text-gray-400 max-w-[160px] truncate" title={deal.name}>
                {deal.name}
              </span>
            )}
            <svg className="w-3 h-3 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {/* Dropdown con line items */}
        {showSelector && (
          <div className="absolute right-0 top-full mt-1 z-30 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
            {/* Header del deal */}
            {deal && (
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{deal.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {deal.closedate && (
                      <span className="text-2xs text-gray-400">
                        {new Date(deal.closedate).toLocaleDateString("es-ES", { month: "short", year: "numeric" })}
                      </span>
                    )}
                    {deal.amount && (
                      <span className="text-2xs font-medium text-emerald-600">{formatCurrency(deal.amount)}</span>
                    )}
                  </div>
                </div>
                {/* Cambiar deal */}
                {availableDeals.length > 1 && (
                  <button
                    onClick={() => setShowSelector(false)}
                    title="Cambiar deal"
                    className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Line items */}
            {(changingDeal) && (
              <div className="px-4 py-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-2.5 w-2/3" delay={i * 60} />
                    <Skeleton className="h-2.5 w-16 ml-auto" delay={i * 60} />
                  </div>
                ))}
              </div>
            )}
            {!changingDeal && deal && lineItems.length === 0 && (
              <p className="px-4 py-4 text-xs text-gray-400 italic">Sin productos registrados en este deal.</p>
            )}
            {!changingDeal && lineItems.length > 0 && (
              <div>
                {lineItems.map((li, idx) => (
                  <div
                    key={li.id}
                    className={`flex items-start gap-3 px-4 py-2.5 ${idx < lineItems.length - 1 ? "border-b border-gray-50" : ""}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 leading-snug truncate">{li.name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {li.quantity && li.quantity !== "1" && (
                        <span className="text-2xs text-gray-400">×{li.quantity} </span>
                      )}
                      {(li.amount ?? li.price) && (
                        <span className="text-xs font-medium text-gray-700">
                          {formatCurrency(li.amount ?? li.price)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Selector de deal (si hay más de uno) */}
            {availableDeals.length > 1 && (
              <div className="border-t border-gray-100">
                <p className="px-4 pt-2 pb-1 text-2xs font-semibold text-gray-400 uppercase tracking-wider">Cambiar deal</p>
                {availableDeals.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => handleChangeDeal(d.id)}
                    className={`w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors ${d.id === deal?.id ? "bg-gray-50" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.isWon ? "bg-emerald-400" : "bg-gray-400"}`} />
                      <span className="text-xs text-gray-700 truncate flex-1">{d.name}</span>
                      {d.amount && <span className="text-2xs text-gray-400 shrink-0">{formatCurrency(d.amount)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const dealUrl = deal && portalId
    ? `https://app.hubspot.com/contacts/${portalId}/deal/${deal.id}`
    : null;

  return (
    <div>
      {/* ── Skeleton cargando ─────────────────────────────────────────────── */}
      {(loadingDeal || changingDeal) && (
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" delay={60} />
          <Skeleton className="h-3 w-3/4" delay={120} />
        </div>
      )}

      {/* ── Sin deal asociado ─────────────────────────────────────────────── */}
      {!loadingDeal && !changingDeal && !deal && (
        <p className="text-xs text-gray-500 italic">Sin deal asociado en HubSpot.</p>
      )}

      {!loadingDeal && !changingDeal && deal && (
        <div className="space-y-2">
          {/* ── Fila superior: badge + nombre del deal + selector ─────────── */}
          {!hideHeader && (
            <div className="flex items-center gap-2 flex-wrap">
              {serviceType && (() => {
                const meta = SERVICE_TYPE_META[serviceType];
                return (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold border ${meta.color}`}>
                    {meta.label}
                  </span>
                );
              })()}
              <span className="text-2xs text-gray-400 truncate max-w-[160px]" title={deal.name}>
                {deal.name}
              </span>
              {deal.amount && (
                <span className="text-2xs font-medium text-emerald-600 ml-auto">{formatCurrency(deal.amount)}</span>
              )}
            </div>
          )}

          {/* Badge + deal name cuando hideHeader=true (viene del SectionLabel externo) */}
          {hideHeader && (
            <div className="flex items-center gap-2 flex-wrap">
              {serviceType && (() => {
                const meta = SERVICE_TYPE_META[serviceType];
                return (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold border ${meta.color}`}>
                    {meta.label}
                  </span>
                );
              })()}
              <span className="text-2xs text-gray-400 truncate flex-1 min-w-0" title={deal.name}>{deal.name}</span>
              {deal.amount && (
                <span className="text-2xs font-semibold text-emerald-500">{formatCurrency(deal.amount)}</span>
              )}
              {/* Selector de deal */}
              {availableDeals.length > 1 && (
                <div className="relative" ref={selectorRef}>
                  <button
                    onClick={() => setShowSelector((v) => !v)}
                    title="Cambiar deal"
                    className="p-0.5 rounded text-gray-600 hover:text-gray-400 hover:bg-gray-800 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </button>
                  {showSelector && (
                    <div className="absolute right-0 top-5 z-20 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl py-1 overflow-hidden">
                      <p className="px-3 py-1.5 text-2xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-800">
                        Seleccionar deal
                      </p>
                      {availableDeals.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => handleChangeDeal(d.id)}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors ${d.id === deal.id ? "bg-gray-800/60" : ""}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.isWon ? "bg-emerald-400" : "bg-gray-500"}`} />
                            <span className="text-xs text-gray-200 truncate flex-1">{d.name}</span>
                            {d.amount && <span className="text-2xs text-gray-400 shrink-0">{formatCurrency(d.amount)}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Acordeón de line items ─────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <button
              onClick={() => setAccordionOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-800/40 transition-colors text-left"
            >
              <span className="text-2xs font-medium text-gray-400">
                {lineItems.length > 0
                  ? `${lineItems.length} producto${lineItems.length !== 1 ? "s" : ""}`
                  : "Sin productos registrados"}
              </span>
              <svg
                className={`w-3 h-3 text-gray-600 transition-transform ${accordionOpen ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {accordionOpen && lineItems.length > 0 && (
              <div className="border-t border-gray-800">
                {lineItems.map((li, idx) => (
                  <div
                    key={li.id}
                    className={`flex items-center gap-3 px-3 py-1.5 ${idx < lineItems.length - 1 ? "border-b border-gray-800/60" : ""}`}
                  >
                    <p className="text-xs text-gray-300 flex-1 min-w-0 truncate">{li.name}</p>
                    <div className="shrink-0 text-right">
                      {li.quantity && li.quantity !== "1" && (
                        <span className="text-2xs text-gray-500">×{li.quantity} </span>
                      )}
                      {(li.amount ?? li.price) && (
                        <span className="text-xs font-medium text-gray-400">
                          {formatCurrency(li.amount ?? li.price)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── CTA: Ver deal en HubSpot ───────────────────────────────────── */}
          {dealUrl && (
            <a
              href={dealUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-2xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Ver deal en HubSpot
            </a>
          )}
        </div>
      )}
    </div>
  );
}
