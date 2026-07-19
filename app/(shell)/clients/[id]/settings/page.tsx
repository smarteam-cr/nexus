"use client";

import { useEffect, useState, useTransition } from "react";
import { BackLink } from "@/components/ui";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import ClientSharing from "@/components/clients/ClientSharing";

interface HubspotAccount {
  id: string;
  hubName: string | null;
  hubspotPortalId: string;
}

interface Client {
  id: string;
  name: string;
  company: string | null;
  industry: string | null;
  notes: string | null;
  emailDomains: string[];
  logoUrl: string | null;
  hubspotAccount: HubspotAccount | null;
}

interface Me {
  role: string | null;
  capabilities: string[];
}

export default function ClientSettingsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);

  // Edición de datos del cliente
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [emailDomains, setEmailDomains] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [, startTransition] = useTransition();

  const fetchClient = async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}`);
      if (!res.ok) throw new Error("Error al cargar el cliente");
      const data: Client = await res.json();
      setClient(data);
      setName(data.name);
      setCompany(data.company ?? "");
      setEmailDomains((data.emailDomains ?? []).join(", "));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClient();
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMe(d))
      .catch(() => {});
    if (searchParams.get("connected") === "1") {
      setJustConnected(true);
      // Limpiar param de URL
      router.replace(`/clients/${clientId}/settings`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const parsedDomains = emailDomains
        .split(/[\s,]+/)
        .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean);

      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, emailDomains: parsedDomains }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      startTransition(() => router.refresh());
    } catch {
      setError("Error al guardar el cliente");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("¿Desconectar HubSpot de este cliente? Esto no elimina la cuenta de HubSpot.")) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/hubspot/disconnect`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Error al desconectar");
      await fetchClient();
    } catch {
      setError("Error al desconectar HubSpot");
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !client) {
    return (
      <div className="p-8">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Volver al cliente */}
      <BackLink href={`/clients/${clientId}`}>Volver al cliente</BackLink>

      {/* Banner de éxito al conectar */}
      {justConnected && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          HubSpot conectado correctamente
        </div>
      )}

      {/* Sección: Datos del cliente */}
      <section className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Datos del cliente</h2>

        <form onSubmit={handleSaveClient} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Nombre *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Sitio web
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="ej. acmecorp.com"
                className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/30 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Dominios de email{" "}
              <span className="text-gray-600 font-normal">(para matching automático de sesiones)</span>
            </label>
            <input
              type="text"
              value={emailDomains}
              onChange={(e) => setEmailDomains(e.target.value)}
              placeholder="ej. ice.go.cr, kolbi.cr"
              className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/30 transition-colors"
            />
            <p className="text-xs text-gray-600 mt-1">
              Separados por coma. Las sesiones donde participe alguien de estos dominios se asignarán automáticamente a este cliente.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2.5 rounded-lg bg-brand hover:bg-brand-light disabled:bg-brand/40 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
            {saveSuccess && (
              <span className="text-green-400 text-sm flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Guardado
              </span>
            )}
          </div>
        </form>
      </section>

      {/* El logo del cliente se gestiona en el tab "Información del cliente" → Marca. */}

      {/* Sección: HubSpot */}
      <section className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-1">Conexión HubSpot</h2>
        <p className="text-xs text-gray-500 mb-4">
          Vincula la cuenta HubSpot de este cliente para poder auditar su CRM, leer datos del portal y ejecutar implementaciones.
        </p>

        {client?.hubspotAccount ? (
          <div className="space-y-4">
            {/* Info de la cuenta conectada */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800 border border-gray-700">
              <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  {client.hubspotAccount.hubName ?? "HubSpot conectado"}
                </p>
                <p className="text-xs text-gray-500">
                  Portal ID: {client.hubspotAccount.hubspotPortalId}
                </p>
              </div>
              <span className="ml-auto flex-shrink-0 text-xs font-medium text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                Activo
              </span>
            </div>

            <div className="flex gap-3">
              <a
                href={`/api/auth/hubspot?clientId=${clientId}`}
                className="px-4 py-2.5 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Reconectar / Cambiar cuenta
              </a>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2.5 rounded-lg border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors"
              >
                Desconectar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-dashed border-gray-700">
              <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-600" />
              </div>
              <p className="text-sm text-gray-500">No hay cuenta HubSpot conectada</p>
            </div>

            <a
              href={`/api/auth/hubspot?clientId=${clientId}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand hover:bg-brand-light text-white text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Conectar HubSpot
            </a>
          </div>
        )}
      </section>

      {/* Sección: Compartir cliente (solo roles con shareClients) */}
      {me?.capabilities.includes("shareClients") && <ClientSharing clientId={clientId} />}

      {/* Sección: Zona de peligro (solo roles con deleteClients) */}
      {me?.capabilities.includes("deleteClients") && (
        <section className="rounded-xl bg-gray-900 border border-red-500/20 p-5">
          <h2 className="text-sm font-semibold text-red-400 mb-1">Zona de peligro</h2>
          <p className="text-xs text-gray-500 mb-4">
            Eliminar el cliente eliminará todo su historial, notas, documentos y configuraciones asociadas. Esta acción no se puede deshacer.
          </p>
          <DeleteClientButton clientId={clientId} />
        </section>
      )}

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}
    </div>
  );
}

// ── Botón de eliminar cliente ──────────────────────────────────────────────────

function DeleteClientButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      router.push("/clients");
    } catch {
      setLoading(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400">¿Confirmar eliminación?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {loading ? "Eliminando..." : "Sí, eliminar"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 text-xs font-medium hover:bg-gray-800 transition-colors"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="px-4 py-2.5 rounded-lg border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors"
    >
      Eliminar cliente
    </button>
  );
}
