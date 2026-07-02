"use client";

/**
 * BusinessCaseStepper — flujo ON-PAGE para crear un business case sobre una
 * empresa de HubSpot (que puede no ser cliente). Tres pasos:
 *   1. Dominio → lookup de la empresa + sus deals (GET /api/business-cases/lookup)
 *   2. Tipo de caso (BC_TYPE_CATALOG) → determina template de landing + tags seed.
 *      HubSpot viene preseleccionado: "Continuar" reproduce el flujo clásico.
 *   3. Empresa + deal OPCIONAL + nombre → crea (POST create-from-company) y
 *      redirige a /business-cases/[id].
 *
 * Molde: HandoffStepper, pero sin modal, sin paso de proyecto y con deal opcional.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { BC_TYPE_CATALOG, DEFAULT_BC_TYPE_ID, resolveBcType } from "@/lib/business-cases/case-types";

type Deal = {
  id: string;
  name: string;
  amount: string | null;
  closedate: string | null;
  isWon: boolean;
  pipeline: string | null;
};
type Lookup = {
  company: { id: string; name: string; domain: string | null } | null;
  deals: Deal[];
  existingClientId: string | null;
  existingClientName: string | null;
  existingIsProspect: boolean | null;
};

function extractDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].trim();
}
function looksLikeDomain(d: string): boolean {
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d);
}
function fmtDate(raw: string): string {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? raw : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

const STEPS = [
  { key: "domain", label: "Empresa" },
  { key: "type", label: "Tipo" },
  { key: "config", label: "Deal y nombre" },
] as const;

export default function BusinessCaseStepper() {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<"domain" | "type" | "config">("domain");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [caseTypeId, setCaseTypeId] = useState(DEFAULT_BC_TYPE_ID);
  const [subtypeId, setSubtypeId] = useState<string>("");
  const [dealId, setDealId] = useState(""); // "" = ningún deal
  const [name, setName] = useState("");
  const autoSearchedRef = useRef("");
  // Última sugerencia automática de nombre: si el usuario no la tocó, se recalcula por tipo.
  const suggestedNameRef = useRef("");

  const suggestName = useCallback(
    (data: Lookup, typeId: string): string => {
      const won = data.deals.find((x) => x.isWon);
      if (won?.name) return won.name;
      const type = resolveBcType(typeId);
      const company = data.company?.name ?? "";
      return typeId === DEFAULT_BC_TYPE_ID ? company : `${type.shortLabel} — ${company}`;
    },
    [],
  );

  const runSearch = useCallback(
    async (rawDomain: string) => {
      const d = extractDomain(rawDomain);
      if (d.length < 3) return;
      autoSearchedRef.current = d;
      setBusy(true);
      try {
        const data = await fetchJson<Lookup>(`/api/business-cases/lookup?domain=${encodeURIComponent(d)}`);
        if (!data.company) {
          toast.error("No existe registro en HubSpot con ese dominio.");
          return;
        }
        setLookup(data);
        setDealId(""); // sin residuo: un deal elegido para la empresa ANTERIOR no aplica a esta
        const suggestion = suggestName(data, DEFAULT_BC_TYPE_ID);
        suggestedNameRef.current = suggestion;
        setName(suggestion);
        setStep("type");
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo buscar la empresa.");
      } finally {
        setBusy(false);
      }
    },
    [toast, suggestName],
  );

  // Auto-búsqueda 1s después de dejar de escribir un dominio completo.
  useEffect(() => {
    const d = extractDomain(domain);
    if (busy || autoSearchedRef.current === d || !looksLikeDomain(d)) return;
    const t = setTimeout(() => runSearch(domain), 1000);
    return () => clearTimeout(t);
  }, [domain, busy, runSearch]);

  const selectedType = resolveBcType(caseTypeId);

  const continueFromType = () => {
    if (!lookup) return;
    // Si el usuario no tocó el nombre sugerido, lo recalculamos según el tipo elegido.
    if (name === suggestedNameRef.current) {
      const suggestion = suggestName(lookup, caseTypeId);
      suggestedNameRef.current = suggestion;
      setName(suggestion);
    }
    setStep("config");
  };

  const create = async () => {
    if (!lookup?.company || busy) return;
    setBusy(true);
    try {
      const data = await fetchJson<{ businessCaseId: string }>("/api/business-cases/create-from-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: lookup.company.id,
          companyName: lookup.company.name,
          domain: lookup.company.domain,
          dealId: dealId || undefined,
          name: name.trim() || undefined,
          caseType: caseTypeId,
          caseSubtype: selectedType.subtypes?.length ? subtypeId || undefined : undefined,
        }),
      });
      toast.success("Business case creado.");
      router.push(`/business-cases/${data.businessCaseId}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear el business case.");
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Indicador de pasos */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => {
          const active = step === s.key;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span className={`flex items-center gap-1.5 text-xs font-medium ${active ? "text-fg" : "text-fg-muted"}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${active ? "bg-brand text-white border-brand" : "border-line text-fg-muted"}`}>
                  {i + 1}
                </span>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="w-6 h-px bg-line" />}
            </div>
          );
        })}
      </div>

      {step === "domain" && (
        <div className="rounded-2xl border border-line bg-surface p-6 space-y-4">
          <p className="text-sm text-fg-muted leading-relaxed">
            Pegá el dominio de la empresa. Buscamos su registro en HubSpot y sus deals apenas se vea completo.
          </p>
          <div>
            <label className="block text-2xs font-medium text-fg-muted uppercase tracking-wider mb-1.5">
              Dominio <span className="text-brand">*</span>
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Ej: acmecorp.com"
              autoFocus
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => runSearch(domain)}
              disabled={busy || domain.trim().length < 3}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Buscando…" : "Buscar empresa"}
            </button>
          </div>
        </div>
      )}

      {step === "type" && lookup?.company && (
        <div className="rounded-2xl border border-line bg-surface p-6 space-y-5">
          <div>
            <p className="text-sm font-semibold text-fg">¿Qué tipo de caso es?</p>
            <p className="text-xs text-fg-muted mt-0.5">
              El tipo define la estructura de la propuesta y su clasificación inicial.
            </p>
          </div>

          <div className="space-y-1.5">
            {BC_TYPE_CATALOG.map((t) => (
              <label
                key={t.id}
                className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border ${
                  t.enabled
                    ? "border-line hover:bg-surface-hover cursor-pointer"
                    : "border-line opacity-50 cursor-not-allowed"
                } ${caseTypeId === t.id ? "border-brand bg-surface-hover" : ""}`}
              >
                <input
                  type="radio"
                  name="bc-type"
                  className="mt-1"
                  disabled={!t.enabled}
                  checked={caseTypeId === t.id}
                  onChange={() => {
                    setCaseTypeId(t.id);
                    setSubtypeId(t.subtypes?.[0]?.id ?? "");
                  }}
                />
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-fg block font-medium">
                    {t.label}
                    {!t.enabled && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-fg-muted border border-line rounded px-1.5 py-0.5">
                        próximamente
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-fg-muted">{t.description}</span>
                </span>
              </label>
            ))}
          </div>

          {selectedType.subtypes?.length ? (
            <div className="space-y-1.5">
              <p className="text-2xs font-medium text-fg-muted uppercase tracking-wider">Tipo de sitio</p>
              <div className="flex gap-2">
                {selectedType.subtypes.map((s) => (
                  <label
                    key={s.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${
                      subtypeId === s.id ? "border-brand bg-surface-hover" : "border-line hover:bg-surface-hover"
                    }`}
                  >
                    <input type="radio" name="bc-subtype" checked={subtypeId === s.id} onChange={() => setSubtypeId(s.id)} />
                    <span className="text-sm text-fg">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex justify-between">
            <button onClick={() => setStep("domain")} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-fg-muted hover:text-fg">
              Atrás
            </button>
            <button onClick={continueFromType} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === "config" && lookup?.company && (
        <div className="rounded-2xl border border-line bg-surface p-6 space-y-5">
          <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
            <p className="text-sm font-semibold text-fg">{lookup.company.name}</p>
            <p className="text-xs text-fg-muted">
              {lookup.company.domain ?? "(sin dominio)"} · {selectedType.label}
              {selectedType.subtypes?.length && subtypeId
                ? ` (${selectedType.subtypes.find((s) => s.id === subtypeId)?.label ?? subtypeId})`
                : ""}
            </p>
            {lookup.existingClientName && (
              <p className="text-[11px] text-fg-muted mt-1">
                Ya existe en Nexus como <span className="font-medium text-fg">{lookup.existingClientName}</span>
                {lookup.existingIsProspect ? " (prospecto)" : ""} — se reusa.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-2xs font-medium text-fg-muted uppercase tracking-wider">Deal de HubSpot (opcional)</p>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line hover:bg-surface-hover cursor-pointer">
              <input type="radio" name="bc-deal" checked={dealId === ""} onChange={() => setDealId("")} />
              <span className="text-sm text-fg">Sin deal</span>
            </label>
            {lookup.deals.map((d) => (
              <label key={d.id} className="flex items-start gap-2 px-3 py-2 rounded-lg border border-line hover:bg-surface-hover cursor-pointer">
                <input type="radio" name="bc-deal" className="mt-1" checked={dealId === d.id} onChange={() => setDealId(d.id)} />
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-fg block">
                    {d.name}
                    {d.isWon && <span className="ml-2 text-[10px] text-emerald-600">ganado</span>}
                  </span>
                  {d.pipeline && <span className="text-[11px] text-fg-muted">{d.pipeline}</span>}
                </span>
                {d.closedate && <span className="text-xs text-fg-muted flex-shrink-0 mt-0.5">{fmtDate(d.closedate)}</span>}
              </label>
            ))}
          </div>

          <div>
            <label className="block text-2xs font-medium text-fg-muted uppercase tracking-wider mb-1.5">Nombre del business case</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Propuesta HubSpot — Acme"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand"
            />
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep("type")} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-fg-muted hover:text-fg">
              Atrás
            </button>
            <button onClick={create} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {busy ? "Creando…" : "Crear business case"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
