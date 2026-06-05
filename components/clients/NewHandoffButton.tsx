"use client";

/**
 * components/clients/NewHandoffButton.tsx
 *
 * CTA para crear un handoff (entidad cliente-level que arranca un proyecto).
 * Dos modos:
 *  - kind="existing": cliente Nexus ya conocido → elegir un deal de su company.
 *  - kind="new": cliente nuevo → nombre + dominio → busca la company en el CRM de
 *    Smarteam (HubSpot sistema) → elegir un deal.
 *
 * Flujo: POST /api/handoffs (crea Client?/Project/canvases/Handoff atómico en Nexus)
 * → dispara el agente de handoff (POST analyze) con progreso → refetch (existing) o
 * navega al cliente (new). NO escribe en HubSpot (eso es Fase 5; queda status=pending).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

// Agente "Handoff Sales→CS" (mismo id que BLOCK_FORMAT_AGENT_IDS en analyze/route.ts).
const HANDOFF_AGENT_ID = "cmmla1g1x00005wijix3qnr7u";

interface Deal {
  id: string;
  name: string;
  amount: string | null;
  closedate: string | null;
  isWon: boolean;
}

interface ProjectOpt {
  id: string;
  name: string;
}

interface Props {
  kind: "existing" | "new";
  clientId?: string;
  clientName?: string;
  onCreated?: () => void;
  label?: string;
  className?: string;
}

function fmtAmount(a: string | null) {
  if (!a) return null;
  const n = Number(a);
  if (Number.isNaN(n)) return a;
  return `$${n.toLocaleString("en-US")}`;
}
function fmtDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

export default function NewHandoffButton({ kind, clientId, clientName, onCreated, label, className }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // form ("new" lookup) / company + deals / selección / creación
  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [resolvedCompany, setResolvedCompany] = useState<{ id: string; name: string; domain: string | null } | null>(null);
  const [existingClient, setExistingClient] = useState<{ id: string; name: string } | null>(null);

  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  // Selector de proyecto: adjuntar a uno existente (id del proyecto) o crear uno
  // nuevo ("__new__") con nombre seteable. Así el handoff + el kickoff quedan en el
  // MISMO proyecto (evita el cruce: handoff en un proyecto, kickoff en otro).
  const [projects, setProjects] = useState<ProjectOpt[] | null>(null);
  const [projectChoice, setProjectChoice] = useState<string>("__new__");
  const [newProjectName, setNewProjectName] = useState<string>("Onboarding");

  const [busy, setBusy] = useState<null | "lookup" | "deals" | "creating" | "agent">(null);
  const [error, setError] = useState<string | null>(null);
  // Si el orquestador devuelve 409 (ya existe un handoff para ese deal), guardamos el
  // clientId del handoff existente para ofrecer un link "Abrir el handoff existente".
  const [conflictClientId, setConflictClientId] = useState<string | null>(null);

  function reset() {
    setCompanyName("");
    setDomain("");
    setResolvedCompany(null);
    setExistingClient(null);
    setDeals(null);
    setSelectedDealId(null);
    setProjects(null);
    setProjectChoice("__new__");
    setNewProjectName("Onboarding");
    setBusy(null);
    setError(null);
    setConflictClientId(null);
  }

  // Carga los proyectos del cliente elegibles para adjuntar el handoff: activos, no
  // sentinel, visibles como tab (hubspotServiceId) y SIN handoff previo (1:1).
  async function loadProjects(cid: string) {
    try {
      const r = await fetch(`/api/clients/${cid}/projects`);
      const data = await r.json();
      const eligible: ProjectOpt[] = (data.projects ?? [])
        .filter(
          (p: { status: string; serviceType: string | null; hubspotServiceId: string | null; handoff: { id: string } | null }) =>
            p.status === "active" && p.serviceType !== "__strategy__" && !!p.hubspotServiceId && !p.handoff,
        )
        .map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
      setProjects(eligible);
      setProjectChoice(eligible[0]?.id ?? "__new__");
    } catch {
      setProjects([]);
      setProjectChoice("__new__");
    }
  }

  async function openDialog() {
    reset();
    setOpen(true);
    // Modo existente: cargar los deals de la company del cliente al abrir.
    if (kind === "existing" && clientId) {
      setBusy("deals");
      try {
        const r = await fetch(`/api/clients/${clientId}/deal-line-items`);
        const data = await r.json();
        setDeals((data.availableDeals ?? []) as Deal[]);
      } catch {
        setError("No se pudieron cargar los deals del cliente.");
        setDeals([]);
      } finally {
        setBusy(null);
      }
      await loadProjects(clientId);
    }
  }

  function close() {
    setOpen(false);
  }

  async function runLookup() {
    if (domain.trim().length < 3) {
      setError("Ingresá un dominio válido (mín. 3 caracteres).");
      return;
    }
    setError(null);
    setBusy("lookup");
    setDeals(null);
    setResolvedCompany(null);
    setExistingClient(null);
    try {
      const r = await fetch(`/api/handoffs/lookup?domain=${encodeURIComponent(domain.trim())}`);
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Búsqueda fallida.");
        return;
      }
      if (!data.company) {
        setError("No se encontró una empresa con ese dominio en el CRM de Smarteam.");
        return;
      }
      setResolvedCompany(data.company);
      if (!companyName.trim()) setCompanyName(data.company.name ?? "");
      setDeals((data.deals ?? []) as Deal[]);
      if (data.existingClientId) {
        setExistingClient({ id: data.existingClientId, name: data.existingClientName });
        await loadProjects(data.existingClientId);
      } else {
        // Cliente nuevo (no existe aún en Nexus): no hay proyectos → se crea uno nuevo.
        setProjects([]);
        setProjectChoice("__new__");
      }
    } catch {
      setError("Error de red en la búsqueda.");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    setError(null);
    setConflictClientId(null);
    setBusy("creating");
    try {
      // Adjuntar a un proyecto existente (targetProjectId) o crear uno nuevo (projectName).
      const projectFields =
        projectChoice === "__new__"
          ? { projectName: newProjectName.trim() || undefined }
          : { targetProjectId: projectChoice };
      const body =
        kind === "existing"
          ? { clientId, dealId: selectedDealId ?? undefined, ...projectFields }
          : {
              companyId: resolvedCompany?.id,
              companyName: companyName.trim() || resolvedCompany?.name,
              domain: domain.trim(),
              dealId: selectedDealId ?? undefined,
              ...projectFields,
            };

      const r = await fetch("/api/handoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "No se pudo crear el handoff.");
        // 409 = ya existe un handoff para ese deal → ofrecer link al existente.
        if (r.status === 409 && data.clientId) setConflictClientId(data.clientId as string);
        setBusy(null);
        return;
      }

      const newClientId: string = data.clientId;
      const projectId: string = data.projectId;

      // Disparar el agente de handoff (corrida larga, reintentable). No bloquea el
      // éxito de la creación: si falla, el handoff queda creado y se puede re-correr.
      setBusy("agent");
      try {
        await fetch(`/api/clients/${newClientId}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: HANDOFF_AGENT_ID, projectId }),
        });
      } catch {
        /* no-op: handoff ya creado */
      }

      // Sincronizar a HubSpot (crear el project en el pipeline CS). Idempotente y
      // no-op si falta el scope; si falla, queda pending y se reconcilia con retry.
      try {
        await fetch("/api/handoffs/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handoffId: data.handoffId }),
        });
      } catch {
        /* no-op: reconciliable vía /api/handoffs/sync */
      }

      setBusy(null);
      setOpen(false);
      if (kind === "existing") {
        router.refresh(); // refresca los tabs de proyecto (si se creó uno nuevo, aparece)
        onCreated?.();
      } else {
        router.push(`/clients/${newClientId}`);
      }
    } catch {
      setError("Error de red al crear el handoff.");
      setBusy(null);
    }
  }

  const projectReady = projects !== null && (projectChoice !== "__new__" || newProjectName.trim().length > 0);
  const canCreate =
    (kind === "existing" ? !!clientId : !!resolvedCompany) && !busy && projectReady;

  return (
    <>
      <button
        onClick={openDialog}
        className={
          className ??
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand/90 transition-colors"
        }
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {label ?? "Nuevo handoff"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={close} />
          <div className="relative w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-950 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h3 className="text-base font-semibold text-white">
                {kind === "existing" ? `Nuevo handoff · ${clientName ?? "cliente"}` : "Nuevo handoff · cliente nuevo"}
              </h3>
              <button onClick={close} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-gray-400">
                Un handoff lleva la info de ventas a CS y arranca el proyecto en Nexus. El sync a HubSpot
                queda pendiente (se habilita cuando esté la re-autorización).
              </p>

              {/* Modo nuevo: nombre + dominio + búsqueda */}
              {kind === "new" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Nombre del cliente</label>
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Ej: Almotec"
                      className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Dominio</label>
                    <div className="flex gap-2">
                      <input
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") runLookup(); }}
                        placeholder="ej: almotec.com"
                        className="flex-1 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand outline-none"
                      />
                      <button
                        onClick={runLookup}
                        disabled={busy === "lookup"}
                        className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-200 hover:bg-gray-700 disabled:opacity-50"
                      >
                        {busy === "lookup" ? "Buscando…" : "Buscar"}
                      </button>
                    </div>
                  </div>

                  {resolvedCompany && (
                    <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 text-xs text-gray-300">
                      Empresa: <span className="text-white font-medium">{resolvedCompany.name}</span>
                      {resolvedCompany.domain ? ` · ${resolvedCompany.domain}` : ""}
                      {existingClient && (
                        <div className="mt-1 text-amber-300">
                          Ya existe el cliente “{existingClient.name}” para esta empresa — se reutilizará.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Selector de deal (ambos modos, una vez hay deals) */}
              {deals !== null && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-400">Deal ancla</label>
                    {busy === "deals" && <span className="text-[11px] text-gray-500">Cargando deals…</span>}
                  </div>
                  {deals.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      No hay deals para esta empresa. Podés crear el handoff sin deal (se puede vincular después).
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {deals.map((d) => {
                        const active = d.id === selectedDealId;
                        return (
                          <button
                            key={d.id}
                            onClick={() => setSelectedDealId(active ? null : d.id)}
                            className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                              active ? "border-brand bg-brand/10" : "border-gray-800 bg-gray-900/40 hover:border-gray-700"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white truncate">{d.name}</span>
                              {d.isWon && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
                                  ganado
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              {[fmtAmount(d.amount), fmtDate(d.closedate)].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Selector de proyecto: adjuntar a uno existente o crear uno nuevo.
                  Asegura que handoff + kickoff queden en el MISMO proyecto. */}
              {projects !== null && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Proyecto</label>
                  <div className="space-y-1.5">
                    {projects.map((p) => {
                      const active = projectChoice === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setProjectChoice(p.id)}
                          className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                            active
                              ? "border-brand bg-brand/10 text-white"
                              : "border-gray-800 bg-gray-900/40 text-gray-300 hover:border-gray-700"
                          }`}
                        >
                          Adjuntar a: <span className="font-medium">{p.name}</span>
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setProjectChoice("__new__")}
                      className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                        projectChoice === "__new__"
                          ? "border-brand bg-brand/10 text-white"
                          : "border-gray-800 bg-gray-900/40 text-gray-300 hover:border-gray-700"
                      }`}
                    >
                      + Crear proyecto nuevo
                    </button>
                  </div>
                  {projectChoice === "__new__" && (
                    <input
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Nombre del proyecto"
                      className="mt-2 w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-brand outline-none"
                    />
                  )}
                  {projects.length === 0 && (
                    <p className="mt-1 text-[11px] text-gray-500">Sin proyectos existentes elegibles — se crea uno nuevo.</p>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                  <span>{error}</span>
                  {conflictClientId && (
                    <button
                      onClick={() => {
                        setOpen(false);
                        router.push(`/clients/${conflictClientId}`);
                      }}
                      className="ml-2 underline font-semibold text-red-200 hover:text-white"
                    >
                      Abrir el handoff existente →
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800">
              <button onClick={close} className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-gray-200">
                Cancelar
              </button>
              <button
                onClick={create}
                disabled={!canCreate}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-brand text-white hover:bg-brand/90 disabled:opacity-40"
              >
                {busy === "creating" ? "Creando…" : busy === "agent" ? "Generando con IA…" : "Crear handoff"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
