"use client";

/**
 * components/handoffs/HandoffStepper.tsx
 *
 * Stepper del vendedor (pieza B) — crear un handoff desde el índice de clientes sin
 * "crear un cliente" a mano. Asocia empresa→deal→proyecto en HubSpot/Nexus reusando:
 *   - GET  /api/handoffs/lookup            (company por dominio + deals ganados)
 *   - GET  /api/handoffs/projects-of-company (proyectos de la company, cruzados con Nexus)
 *   - POST /api/handoffs/import-project     (importar-y-adjuntar un proyecto HubSpot suelto)
 *   - POST /api/handoffs                    (orquestador atómico: client+project+handoff)
 *   - <SessionSelectionReview>              (curar las sesiones del nuevo proyecto)
 *
 * Self-gated: solo visible con la capability `createHandoff` (VENTAS + SUPER_ADMIN).
 * La generación del handoff la hace el flujo in-project (ProjectHandoffSection); el
 * stepper arma la fundación y deja al vendedor podar las sesiones.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, Input } from "@/components/ui";
import { useMe } from "@/hooks/useMe";
import SessionSelectionReview from "@/components/clients/SessionSelectionReview";
import { UnreviewedSessionsChip } from "@/components/clients/ProjectSessionsReview";

interface AvailableDeal {
  id: string;
  name: string;
  amount: string | null;
  closedate: string | null;
  isWon: boolean;
  pipeline: string | null;
}
interface LookupResult {
  company: { id: string; name: string; domain: string | null } | null;
  deals: AvailableDeal[];
  existingClientId: string | null;
  existingClientName: string | null;
}
interface CompanyProject {
  hubspotProjectId: string;
  name: string;
  stage: string | null;
  createdAt: string | null;
  nexusProjectId: string | null;
  hasHandoff: boolean;
}

type Step = "domain" | "config" | "done";
const STEPS: { key: Step; label: string }[] = [
  { key: "domain", label: "Empresa" },
  { key: "config", label: "Deal y proyecto" },
  { key: "done", label: "Listo" },
];

// Normaliza lo que el usuario pega (URL completa, con www/path/query) a un dominio pelado.
function extractDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .trim();
}
// ¿Parece un dominio completo? Al menos un punto y un TLD de 2+ letras: .com, .ai, .mx, .com.mx.
function looksLikeDomain(d: string): boolean {
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d);
}

function fmtDate(raw: string): string {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? raw : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function HandoffStepper() {
  const router = useRouter();
  const me = useMe();
  const canCreate = me?.capabilities.includes("createHandoff") ?? false;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("domain");
  const [domain, setDomain] = useState("");
  const [lookedUpDomain, setLookedUpDomain] = useState(""); // dominio de la última búsqueda OK
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [dealId, setDealId] = useState("");
  const [projects, setProjects] = useState<CompanyProject[]>([]);
  const [projectSel, setProjectSel] = useState("new"); // "new" | hubspotProjectId
  const [newProjectName, setNewProjectName] = useState("");
  const [created, setCreated] = useState<{ clientId: string; projectId: string } | null>(null);

  // Dominio ya buscado (auto o manual) — evita relanzar la auto-búsqueda en loop.
  const autoSearchedRef = useRef("");

  const runSearch = useCallback(async (rawDomain: string) => {
    const d = extractDomain(rawDomain);
    if (d.length < 3) return;
    autoSearchedRef.current = d;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/handoffs/lookup?domain=${encodeURIComponent(d)}`);
      const data = (await r.json()) as LookupResult & { error?: string };
      if (!r.ok) {
        setError(data.error ?? "No se pudo buscar.");
        return;
      }
      if (!data.company) {
        setError("No existe registro en HubSpot con esta URL.");
        return;
      }
      setLookup(data);
      setLookedUpDomain(d);
      const won = data.deals.filter((x) => x.isWon);
      if (won.length === 1) setDealId(won[0].id);
      setNewProjectName(won[0]?.name ?? data.company.name);
      // Proyectos de la company. Se muestran TODOS; los que ya tienen handoff van
      // deshabilitados (no se puede crear un 2º handoff para el mismo proyecto).
      try {
        const pr = await fetch(`/api/handoffs/projects-of-company?companyId=${data.company.id}`);
        const pdata = (await pr.json()) as { projects?: CompanyProject[] };
        setProjects(pdata.projects ?? []);
      } catch {
        setProjects([]);
      }
      setStep("config");
    } catch {
      setError("Error de conexión.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Auto-búsqueda: arranca 1s después de que el usuario deja de escribir, si lo escrito
  // ya parece un dominio completo y no se buscó antes. (El setState vive dentro del
  // timeout/runSearch, no en el cuerpo del efecto → no dispara set-state-in-effect.)
  useEffect(() => {
    const d = extractDomain(domain);
    if (busy || autoSearchedRef.current === d || !looksLikeDomain(d)) return;
    const t = setTimeout(() => runSearch(domain), 1000);
    return () => clearTimeout(t);
  }, [domain, busy, runSearch]);

  if (!canCreate) return null;

  const reset = () => {
    setOpen(false);
    setStep("domain");
    setDomain("");
    setLookedUpDomain("");
    autoSearchedRef.current = "";
    setBusy(false);
    setError(null);
    setLookup(null);
    setDealId("");
    setProjects([]);
    setProjectSel("new");
    setNewProjectName("");
    setCreated(null);
  };

  const wonDeals = (lookup?.deals ?? []).filter((d) => d.isWon);
  const stepIdx = step === "domain" ? 0 : step === "config" ? 1 : 2;
  // El paso "config" es alcanzable si ya hubo una búsqueda OK. "done" solo post-creación.
  const reachable = (s: Step): boolean =>
    step === "done" ? false : s === "domain" ? true : s === "config" ? !!lookup : false;
  // Volver al paso domain sin perder el lookup → "Siguiente" si no se editó el dominio.
  const domainUnchanged = !!lookup && extractDomain(domain) === lookedUpDomain;

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(domain);
  };

  const handleCreate = async () => {
    if (!lookup?.company || busy) return;
    setBusy(true);
    setError(null);
    try {
      const company = lookup.company;
      let targetProjectId: string | undefined;
      let clientId: string | undefined = lookup.existingClientId ?? undefined;

      if (projectSel !== "new") {
        const proj = projects.find((p) => p.hubspotProjectId === projectSel);
        if (!proj) throw new Error("Proyecto no encontrado.");
        if (proj.nexusProjectId) {
          targetProjectId = proj.nexusProjectId;
        } else {
          // Importar y adjuntar: el proyecto existe en HubSpot pero no en Nexus.
          const imp = await fetch("/api/handoffs/import-project", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId: company.id,
              companyName: company.name,
              domain: company.domain,
              hubspotProjectId: proj.hubspotProjectId,
            }),
          });
          const impData = (await imp.json()) as { clientId?: string; nexusProjectId?: string; error?: string };
          if (!imp.ok || !impData.nexusProjectId) throw new Error(impData.error ?? "No se pudo importar el proyecto.");
          targetProjectId = impData.nexusProjectId;
          clientId = impData.clientId;
        }
      }

      const payload: Record<string, unknown> = { dealId: dealId || undefined };
      if (targetProjectId) payload.targetProjectId = targetProjectId;
      else payload.projectName = newProjectName.trim() || undefined;
      if (clientId) payload.clientId = clientId;
      else {
        payload.companyId = company.id;
        payload.companyName = company.name;
        payload.domain = company.domain;
      }

      const res = await fetch("/api/handoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { clientId?: string; projectId?: string; error?: string };
      if (res.status === 409 && data.clientId) {
        // Ya existe un handoff para ese deal → navegar al cliente, no es error.
        router.push(`/clients/${data.clientId}`);
        reset();
        return;
      }
      if (!res.ok || !data.clientId || !data.projectId) throw new Error(data.error ?? "No se pudo crear el handoff.");
      setCreated({ clientId: data.clientId, projectId: data.projectId });
      setStep("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el handoff.");
    } finally {
      setBusy(false);
    }
  };

  const footer =
    step === "domain" ? (
      <>
        <Button type="button" variant="secondary" size="md" onClick={reset} disabled={busy}>
          Cancelar
        </Button>
        {domainUnchanged ? (
          <Button type="button" variant="primary" size="md" className="bg-brand hover:bg-brand-dark" onClick={() => setStep("config")}>
            Siguiente
          </Button>
        ) : (
          <Button
            type="submit"
            form="handoff-domain-form"
            variant="primary"
            size="md"
            className="bg-brand hover:bg-brand-dark"
            loading={busy}
            disabled={domain.trim().length < 3}
          >
            Buscar empresa
          </Button>
        )}
      </>
    ) : step === "config" ? (
      <>
        <Button type="button" variant="secondary" size="md" onClick={() => setStep("domain")} disabled={busy}>
          Atrás
        </Button>
        <Button
          type="button"
          variant="primary"
          size="md"
          className="bg-brand hover:bg-brand-dark"
          onClick={handleCreate}
          loading={busy}
          disabled={wonDeals.length === 0 || !dealId || (projectSel === "new" && newProjectName.trim().length === 0)}
        >
          Crear handoff
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="secondary" size="md" onClick={reset}>
          Cerrar
        </Button>
        {created && (
          <Button
            type="button"
            variant="primary"
            size="md"
            className="bg-brand hover:bg-brand-dark"
            onClick={() => {
              const c = created;
              reset();
              router.push(`/clients/${c.clientId}/projects/${c.projectId}`);
            }}
          >
            Ir al proyecto y generar
          </Button>
        )}
      </>
    );

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m4 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        Nuevo handoff
      </Button>

      <Modal open={open} onClose={reset} title="Nuevo handoff" size="md" footer={footer}>
        {/* Indicador de pasos — los visitados son clickeables (ir adelante/atrás). */}
        <div className="flex items-center gap-2 mb-4">
          {STEPS.map((s, i) => {
            const active = i === stepIdx;
            const canClick = reachable(s.key) && !active;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canClick}
                  onClick={() => canClick && setStep(s.key)}
                  className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                    active ? "text-fg" : canClick ? "text-fg-muted hover:text-fg cursor-pointer" : "text-fg-muted cursor-default"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                      active ? "bg-brand text-white border-brand" : "border-line text-fg-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <span className="w-4 h-px bg-line" />}
              </div>
            );
          })}
        </div>

        {/* Paso 1 — dominio */}
        {step === "domain" && (
          <form id="handoff-domain-form" onSubmit={search} className="space-y-3">
            <p className="text-xs text-fg-muted leading-relaxed">
              Pegá el dominio de la empresa. Buscamos su registro en HubSpot y sus deals ganados apenas se vea completo.
            </p>
            <div>
              <label className="block text-2xs font-medium text-fg-muted uppercase tracking-wider mb-1">
                Dominio <span className="text-brand">*</span>
              </label>
              <Input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="Ej: acmecorp.com"
                autoFocus
              />
            </div>
            {busy ? (
              <p className="flex items-center gap-2 text-xs text-fg-muted">
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Buscando empresa en HubSpot…
              </p>
            ) : error ? (
              <p className="text-xs text-red-500">{error}</p>
            ) : null}
          </form>
        )}

        {/* Paso 2 — deal + proyecto */}
        {step === "config" && lookup?.company && (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
              <p className="text-sm font-semibold text-fg">{lookup.company.name}</p>
              <p className="text-xs text-fg-muted">{lookup.company.domain ?? "(sin dominio)"}</p>
              {lookup.existingClientName && (
                <p className="text-[11px] text-fg-muted mt-1">
                  Ya existe en Nexus como <span className="font-medium text-fg">{lookup.existingClientName}</span> — se reusa.
                </p>
              )}
            </div>

            {/* Deal ganado */}
            <div className="space-y-1.5">
              <p className="text-2xs font-medium text-fg-muted uppercase tracking-wider">Deal ganado</p>
              {wonDeals.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Esta empresa no tiene deals ganados en HubSpot. Marcá el deal como ganado antes de crear el handoff.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {wonDeals.map((d) => {
                    const only = wonDeals.length === 1;
                    return (
                      <label
                        key={d.id}
                        className={`flex items-start gap-2 px-3 py-2 rounded-lg border border-line ${only ? "" : "hover:bg-surface-hover cursor-pointer"}`}
                      >
                        {!only && (
                          <input
                            type="radio"
                            name="handoff-deal"
                            className="mt-1"
                            checked={dealId === d.id}
                            onChange={() => setDealId(d.id)}
                          />
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="text-sm text-fg block">{d.name}</span>
                          {d.pipeline && <span className="text-[11px] text-fg-muted">{d.pipeline}</span>}
                        </span>
                        {d.closedate && <span className="text-xs text-fg-muted flex-shrink-0 mt-0.5">{fmtDate(d.closedate)}</span>}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Proyecto de HubSpot: adjuntar uno existente o crear uno nuevo. */}
            <div className="space-y-1.5">
              <p className="text-2xs font-medium text-fg-muted uppercase tracking-wider">Proyecto de HubSpot</p>
              {projects.map((p) => {
                const disabled = p.hasHandoff;
                return (
                  <label
                    key={p.hubspotProjectId}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-line ${
                      disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-surface-hover cursor-pointer"
                    }`}
                  >
                    <input
                      type="radio"
                      name="handoff-project"
                      disabled={disabled}
                      checked={projectSel === p.hubspotProjectId}
                      onChange={() => !disabled && setProjectSel(p.hubspotProjectId)}
                    />
                    <span className="text-sm text-fg flex-1 truncate">{p.name}</span>
                    {p.hasHandoff ? (
                      <span className="text-[10px] font-medium text-fg-muted bg-surface-muted border border-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                        ya tiene handoff
                      </span>
                    ) : !p.nexusProjectId ? (
                      <span className="text-[10px] font-medium text-fg-muted bg-surface-muted border border-line rounded-full px-1.5 py-0.5 flex-shrink-0">
                        se importará
                      </span>
                    ) : null}
                  </label>
                );
              })}

              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line hover:bg-surface-hover cursor-pointer">
                <input type="radio" name="handoff-project" checked={projectSel === "new"} onChange={() => setProjectSel("new")} />
                <span className="text-sm text-fg">Crear proyecto nuevo</span>
              </label>
              {projectSel === "new" && (
                <Input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Nombre del proyecto"
                />
              )}
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        )}

        {/* Paso 3 — creado: curar sesiones antes de ir a generar */}
        {step === "done" && created && (
          <div className="space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <p className="text-sm font-semibold text-green-700">Handoff creado</p>
              <p className="text-xs text-green-700/80">
                Revisá las sesiones que lo van a armar y después generá el handoff en el proyecto.
              </p>
            </div>
            {/* Aviso (nunca bloqueo): en clientes multi-proyecto, links de IA sin confirmar
                pueden mezclar contexto de otro proyecto. Abre el panel de curación. */}
            <UnreviewedSessionsChip projectId={created.projectId} />
            <SessionSelectionReview projectId={created.projectId} />
          </div>
        )}
      </Modal>
    </>
  );
}
