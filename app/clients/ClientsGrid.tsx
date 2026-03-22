"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import DeleteClientButton from "./DeleteClientButton";

interface HubspotAccountInfo {
  id: string;
  hubName: string | null;
  hubspotPortalId: string;
}

interface Client {
  id: string;
  name: string;
  company: string | null;
  industry: string | null;
  createdAt: Date;
  hubspotAccount: HubspotAccountInfo | null;
  _count: { audits: number; implementations: number; documents: number };
}

interface Props {
  clients: Client[];
}

// ─── Card de cliente ───────────────────────────────────────────────────────────

function ClientCard({ client }: { client: Client }) {
  const hasHubspot = !!client.hubspotAccount;

  return (
    <Link
      href={`/clients/${client.id}`}
      className="group relative flex flex-col gap-3 p-5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-800/70 transition-all duration-150"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white text-base truncate leading-tight">
            {client.name}
          </p>
          {client.company && (
            <p className="text-sm text-gray-400 truncate mt-0.5">
              {client.company}
            </p>
          )}
          {client.industry && (
            <p className="text-xs text-gray-600 truncate mt-0.5">
              {client.industry}
            </p>
          )}
        </div>

        {/* HubSpot status */}
        <div
          className={`flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
            hasHubspot
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-gray-800 text-gray-500 border border-gray-700"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              hasHubspot ? "bg-green-400" : "bg-gray-600"
            }`}
          />
          {hasHubspot
            ? client.hubspotAccount!.hubName ?? "HubSpot"
            : "Sin HubSpot"}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-gray-600">
        {client._count.audits > 0 && (
          <span>{client._count.audits} auditoría{client._count.audits !== 1 ? "s" : ""}</span>
        )}
        {client._count.implementations > 0 && (
          <>
            {client._count.audits > 0 && <span>·</span>}
            <span>{client._count.implementations} implementación{client._count.implementations !== 1 ? "es" : ""}</span>
          </>
        )}
        {client._count.audits === 0 && client._count.implementations === 0 && (
          <span className="italic">Proceso no iniciado</span>
        )}
      </div>

      {/* Botón eliminar (hover) */}
      <DeleteClientButton clientId={client.id} />

      {/* Flecha hover */}
      <svg
        className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ─── Botón / formulario "Nuevo cliente" ────────────────────────────────────────

function NewClientCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setOpen(false);
    setName("");
    setCompany("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), company: company.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Error al crear el cliente");
      const data = await res.json() as { id?: string };
      const clientId = data.id;
      if (!clientId) throw new Error("Sin ID de cliente");
      router.push(`/clients/${clientId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 p-5 rounded-xl border border-dashed border-gray-700 hover:border-brand/40 hover:bg-brand/5 text-gray-500 hover:text-brand-light transition-all duration-150 w-full text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">Nuevo cliente</p>
          <p className="text-xs text-gray-600 mt-0.5">Crear perfil de cliente</p>
        </div>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5 rounded-xl border border-brand/30 bg-brand/5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white">Nuevo cliente</p>
        <button
          onClick={reset}
          className="text-gray-500 hover:text-gray-300 transition-colors"
          type="button"
          aria-label="Cancelar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="block text-2xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Nombre <span className="text-brand-light">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Acme Corp"
            required
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50 transition-colors"
          />
        </div>

        <div>
          <label className="block text-2xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Sitio web <span className="text-gray-600">(opcional)</span>
          </label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Ej: acmecorp.com"
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50 transition-colors"
          />
        </div>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
                Creando…
              </>
            ) : (
              "Crear cliente"
            )}
          </button>
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 hover:text-white transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Grid principal ────────────────────────────────────────────────────────────

export default function ClientsGrid({ clients }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <NewClientCard />

      {clients.map((client) => (
        <ClientCard key={client.id} client={client} />
      ))}
    </div>
  );
}
