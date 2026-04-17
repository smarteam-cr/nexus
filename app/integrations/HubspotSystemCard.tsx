"use client";

import { useState } from "react";

interface HubspotStatus {
  connected: boolean;
  hubName?: string | null;
  hubspotPortalId?: string | null;
  updatedAt?: string;
}

interface ImportResult {
  total: number;
  created: number;
  updated: number;
}

export default function HubspotSystemCard({
  status,
  justConnected,
}: {
  status: HubspotStatus;
  justConnected: boolean;
}) {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const res = await fetch("/api/system/hubspot/import", { method: "POST" });
      const data = await res.json() as { ok?: boolean; total?: number; created?: number; updated?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error al importar");
      setImportResult({ total: data.total ?? 0, created: data.created ?? 0, updated: data.updated ?? 0 });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
      <div className="flex items-start gap-4">
        {/* Logo HubSpot */}
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#ff7a59]/10 border border-[#ff7a59]/20 flex items-center justify-center shadow-lg">
          <svg className="w-6 h-6 text-[#ff7a59]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.8 10.2V7.8a2.4 2.4 0 0 0-1.2-2.08V4.2a2.4 2.4 0 1 0-4.8 0v1.52A2.4 2.4 0 0 0 9.6 7.8v2.4a4.8 4.8 0 0 0-2.4 4.16V16.8a4.8 4.8 0 0 0 9.6 0v-2.44a4.8 4.8 0 0 0-2.4-4.16M12 3.6a.6.6 0 1 1 0 1.2.6.6 0 0 1 0-1.2m1.2 13.2a1.2 1.2 0 1 1-2.4 0v-3.6a1.2 1.2 0 0 1 2.4 0z" />
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h2 className="text-sm font-semibold text-white">HubSpot</h2>
            <span className="text-xs text-gray-500">Cuenta del sistema</span>
            {status.connected ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                Conectado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-700/50 border border-gray-700 text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" />
                No conectado
              </span>
            )}
          </div>

          <p className="text-xs text-gray-400 leading-relaxed mb-4">
            Conecta el portal principal de HubSpot para importar clientes automáticamente
            a partir de la propiedad <code className="text-gray-300 bg-gray-800 px-1 py-0.5 rounded text-2xs">Nexus = true</code>.
          </p>

          {/* Banner: recién conectado */}
          {justConnected && (
            <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              HubSpot conectado correctamente
            </div>
          )}

          {status.connected ? (
            <div className="space-y-4">
              {/* Info del portal */}
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700">
                <div className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    {status.hubName ?? "HubSpot conectado"}
                  </p>
                  <p className="text-xs text-gray-500">
                    Portal ID: #{status.hubspotPortalId}
                  </p>
                </div>
              </div>

              {/* Resultado de importación */}
              {importResult && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-brand/5 border border-brand/20 text-xs">
                  <svg className="w-4 h-4 text-brand-light flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-white font-medium">Importación completada</p>
                    <p className="text-gray-400 mt-0.5">
                      {importResult.total} empresa{importResult.total !== 1 ? "s" : ""} encontrada{importResult.total !== 1 ? "s" : ""} —{" "}
                      <span className="text-green-400">{importResult.created} creada{importResult.created !== 1 ? "s" : ""}</span>
                      {importResult.updated > 0 && (
                        <>, <span className="text-blue-400">{importResult.updated} actualizada{importResult.updated !== 1 ? "s" : ""}</span></>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {importError && (
                <p className="text-xs text-red-400 px-1">{importError}</p>
              )}

              {/* Acciones */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand hover:bg-brand-light disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                >
                  {importing ? (
                    <>
                      <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Importar clientes (Nexus = true)
                    </>
                  )}
                </button>

                <a
                  href="/api/auth/hubspot?system=1"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-700 text-gray-400 text-xs font-medium hover:bg-gray-800 hover:text-white transition-colors"
                >
                  Reconectar / Cambiar cuenta
                </a>
              </div>
            </div>
          ) : (
            <a
              href="/api/auth/hubspot?system=1"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#ff7a59] hover:bg-[#ff8f73] text-white text-xs font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Conectar HubSpot del sistema
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
