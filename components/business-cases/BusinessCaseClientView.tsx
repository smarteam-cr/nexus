"use client";

/**
 * BusinessCaseClientView — master-detail de los business cases de un cliente.
 * Izquierda: lista + "Nuevo" (modal con nombre + picker de empresa HubSpot).
 * Derecha: la vista del caso seleccionado (BusinessCaseView).
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import HubspotCompanyPicker, { type PickedCompany } from "./HubspotCompanyPicker";
import BusinessCaseView from "./BusinessCaseView";

type BCSummary = {
  id: string;
  name: string;
  status: string;
  publishedAt: string | null;
  _count: { blocks: number; transcripts: number };
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
};

export default function BusinessCaseClientView({
  clientId,
  clientName,
  hasHubspot,
}: {
  clientId: string;
  clientName: string;
  hasHubspot: boolean;
}) {
  const toast = useToast();
  const [cases, setCases] = useState<BCSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ businessCases: BCSummary[] }>(
        `/api/clients/${clientId}/business-cases`,
      );
      setCases(data.businessCases);
      setSelectedId((prev) => prev ?? data.businessCases[0]?.id ?? null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar los casos.");
    } finally {
      setLoading(false);
    }
  }, [clientId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b border-line flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link href="/business-cases" className="text-xs text-fg-muted hover:text-fg">
            ← Ventas
          </Link>
          <h1 className="text-lg font-semibold text-fg truncate">{clientName}</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex-shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Nuevo business case
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Lista */}
        <aside className="w-72 flex-shrink-0 border-r border-line overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-fg-muted">Cargando…</p>
          ) : cases.length === 0 ? (
            <p className="p-4 text-sm text-fg-muted">
              Sin casos todavía. Creá el primero con “Nuevo business case”.
            </p>
          ) : (
            <ul className="p-2 space-y-1">
              {cases.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${
                      selectedId === c.id ? "bg-surface-hover" : "hover:bg-surface-hover"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg truncate">{c.name}</span>
                      <span
                        className={`flex-shrink-0 text-2xs px-1.5 py-0.5 rounded ${
                          c.status === "PUBLISHED"
                            ? "bg-emerald-500/15 text-emerald-600"
                            : "bg-surface-muted text-fg-muted"
                        }`}
                      >
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-2xs text-fg-muted">
                      {c._count.blocks} bloque{c._count.blocks === 1 ? "" : "s"} ·{" "}
                      {c._count.transcripts} transcript{c._count.transcripts === 1 ? "" : "s"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Detalle */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          {selectedId ? (
            <BusinessCaseView key={selectedId} bcId={selectedId} onChanged={load} />
          ) : (
            <div className="grid place-items-center h-full text-sm text-fg-muted">
              Seleccioná o creá un business case.
            </div>
          )}
        </main>
      </div>

      {showCreate && (
        <CreateModal
          clientId={clientId}
          hasHubspot={hasHubspot}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            setSelectedId(id);
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateModal({
  clientId,
  hasHubspot,
  onClose,
  onCreated,
}: {
  clientId: string;
  hasHubspot: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [company, setCompany] = useState<PickedCompany | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const data = await fetchJson<{ businessCase: { id: string } }>(
        `/api/clients/${clientId}/business-cases`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), hubspotCompanyId: company?.id ?? null }),
        },
      );
      toast.success("Business case creado.");
      onCreated(data.businessCase.id);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-fg">Nuevo business case</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Ej. Propuesta HubSpot — Multiquímica"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-1.5">
              Empresa de HubSpot {hasHubspot ? "(opcional)" : ""}
            </label>
            {hasHubspot ? (
              <HubspotCompanyPicker clientId={clientId} value={company} onChange={setCompany} />
            ) : (
              <p className="text-xs text-fg-muted">
                Este cliente no tiene HubSpot conectado — podés crear el caso igual.
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-fg-muted hover:text-fg"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || busy}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Creando…" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
