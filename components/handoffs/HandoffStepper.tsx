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
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, Input } from "@/components/ui";
import { useMe } from "@/hooks/useMe";
import SessionSelectionReview from "@/components/clients/SessionSelectionReview";

interface AvailableDeal {
  id: string;
  name: string;
  amount: string | null;
  closedate: string | null;
  isWon: boolean;
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

function fmtDate(raw: string): string {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? raw : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function HandoffStepper() {
  const router = useRouter();
  const me = useMe();
  const canCreate = me?.capabilities.includes("createHandoff") ?? false;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"domain" | "config" | "done">("domain");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [dealId, setDealId] = useState("");
  const [projects, setProjects] = useState<CompanyProject[]>([]);
  const [projectSel, setProjectSel] = useState("new"); // "new" | hubspotProjectId
  const [newProjectName, setNewProjectName] = useState("");
  const [created, setCreated] = useState<{ clientId: string; projectId: string } | null>(null);

  if (!canCreate) return null;

  const reset = () => {
    setOpen(false);
    setStep("domain");
    setDomain("");
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

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = domain.trim().toLowerCase();
    if (d.length < 3 || busy) return;
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
      const won = data.deals.filter((x) => x.isWon);
      if (won.length === 1) setDealId(won[0].id);
      setNewProjectName(won[0]?.name ?? data.company.name);
      // Proyectos de la company (sin los que ya tienen handoff → evita el 409).
      try {
        const pr = await fetch(`/api/handoffs/projects-of-company?companyId=${data.company.id}`);
        const pdata = (await pr.json()) as { projects?: CompanyProject[] };
        setProjects((pdata.projects ?? []).filter((p) => !p.hasHandoff));
      } catch {
        setProjects([]);
      }
      setStep("config");
    } catch {
      setError("Error de conexión.");
    } finally {
      setBusy(false);
    }
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
        <Button type="submit" form="handoff-domain-form" variant="primary" size="md" loading={busy} disabled={domain.trim().length < 3}>
          Buscar empresa
        </Button>
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
        {/* Paso 1 — dominio */}
        {step === "domain" && (
          <form id="handoff-domain-form" onSubmit={search} className="space-y-3">
            <p className="text-xs text-fg-muted leading-relaxed">
              Pegá el dominio de la empresa. Buscamos su registro en HubSpot y sus deals ganados.
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
            {error && <p className="text-xs text-red-500">{error}</p>}
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
              ) : wonDeals.length === 1 ? (
                <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="text-sm text-fg flex-1">{wonDeals[0].name}</span>
                  {wonDeals[0].closedate && <span className="text-xs text-fg-muted">{fmtDate(wonDeals[0].closedate)}</span>}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {wonDeals.map((d) => (
                    <label
                      key={d.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line hover:bg-surface-hover cursor-pointer"
                    >
                      <input type="radio" name="handoff-deal" checked={dealId === d.id} onChange={() => setDealId(d.id)} />
                      <span className="text-sm text-fg flex-1">{d.name}</span>
                      {d.closedate && <span className="text-xs text-fg-muted">{fmtDate(d.closedate)}</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Proyecto: crear nuevo o adjuntar uno existente */}
            <div className="space-y-1.5">
              <p className="text-2xs font-medium text-fg-muted uppercase tracking-wider">Proyecto</p>
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
              {projects.map((p) => (
                <label
                  key={p.hubspotProjectId}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line hover:bg-surface-hover cursor-pointer"
                >
                  <input
                    type="radio"
                    name="handoff-project"
                    checked={projectSel === p.hubspotProjectId}
                    onChange={() => setProjectSel(p.hubspotProjectId)}
                  />
                  <span className="text-sm text-fg flex-1 truncate">{p.name}</span>
                  {!p.nexusProjectId && (
                    <span className="text-[10px] font-medium text-fg-muted bg-surface-muted border border-line rounded-full px-1.5 py-0.5">
                      se importará
                    </span>
                  )}
                </label>
              ))}
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
            <SessionSelectionReview projectId={created.projectId} />
          </div>
        )}
      </Modal>
    </>
  );
}
