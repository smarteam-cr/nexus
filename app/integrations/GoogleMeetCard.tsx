"use client";

import { useState } from "react";

interface Props {
  connected: boolean;
  adminEmail: string | null;
  sessionCount: number;
}

export default function GoogleMeetCard({ connected, adminEmail, sessionCount }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; total: number } | null>(null);
  const [enrichResult, setEnrichResult] = useState<{ enriched: number } | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [enrichError, setEnrichError] = useState(false);
  const [count, setCount] = useState(sessionCount);

  async function handleSync() {
    setSyncing(true);
    setSyncError(false);
    setSyncResult(null);
    try {
      const res = await fetch("/api/integrations/google/sync", { method: "POST" });
      if (!res.ok) throw new Error("sync_failed");
      const data = (await res.json()) as { synced: number; alreadyExisted: number; total: number };
      setSyncResult({ synced: data.synced, total: data.total });
      setCount(data.total);
    } catch {
      setSyncError(true);
    } finally {
      setSyncing(false);
    }
  }

  async function handleEnrich() {
    setEnriching(true);
    setEnrichError(false);
    setEnrichResult(null);
    try {
      const res = await fetch("/api/integrations/google/enrich", { method: "POST" });
      if (!res.ok) throw new Error("enrich_failed");
      const data = (await res.json()) as { enriched: number; skipped: number; errors: number };
      setEnrichResult({ enriched: data.enriched });
    } catch {
      setEnrichError(true);
    } finally {
      setEnriching(false);
    }
  }

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
      <div className="flex items-start gap-4">
        {/* Logo Google Meet */}
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shadow-lg">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" fill="#1a73e8" />
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h2 className="text-sm font-semibold text-white">Google Meet / Gemini</h2>
            {connected ? (
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
            Sincroniza reuniones de Google Meet grabadas con Gemini. Los transcripts y
            notas de Gemini aparecerán automáticamente en cada cliente para análisis y seguimiento.
          </p>

          {connected ? (
            <ConnectedState
              adminEmail={adminEmail!}
              count={count}
              syncing={syncing}
              enriching={enriching}
              syncResult={syncResult}
              enrichResult={enrichResult}
              syncError={syncError}
              enrichError={enrichError}
              onSync={handleSync}
              onEnrich={handleEnrich}
            />
          ) : (
            <DisconnectedState />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Estado conectado ──────────────────────────────────────────────────────────

function ConnectedState({
  adminEmail,
  count,
  syncing,
  enriching,
  syncResult,
  enrichResult,
  syncError,
  enrichError,
  onSync,
  onEnrich,
}: {
  adminEmail: string;
  count: number;
  syncing: boolean;
  enriching: boolean;
  syncResult: { synced: number; total: number } | null;
  enrichResult: { enriched: number } | null;
  syncError: boolean;
  enrichError: boolean;
  onSync: () => void;
  onEnrich: () => void;
}) {
  return (
    <div className="space-y-2">
      {/* Info de la cuenta */}
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-green-500/5 border border-green-500/10">
        <svg
          className="w-4 h-4 text-green-400 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="min-w-0">
          <p className="text-xs font-medium text-green-400">Service Account configurada</p>
          <p className="text-xs text-gray-400 truncate">Admin: {adminEmail}</p>
        </div>
      </div>

      <p className="text-xs text-gray-600">
        Las credenciales se leen desde{" "}
        <code className="text-gray-500 bg-gray-800 px-1 py-0.5 rounded">
          GOOGLE_SERVICE_ACCOUNT_KEY
        </code>{" "}
        y{" "}
        <code className="text-gray-500 bg-gray-800 px-1 py-0.5 rounded">
          GOOGLE_ADMIN_EMAIL
        </code>
        .
      </p>

      {/* Contador de sesiones */}
      {count > 0 && (
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-400">{count}</span> sesiones Meet en caché local
        </p>
      )}

      {/* Resultados */}
      {syncResult && !syncing && (
        <span className="text-xs text-green-400 block">
          {syncResult.synced} sesiones nuevas sincronizadas
        </span>
      )}
      {syncError && !syncing && (
        <span className="text-xs text-red-400 block">Error al sincronizar. Intenta de nuevo.</span>
      )}
      {enrichResult && !enriching && (
        <span className="text-xs text-blue-400 block">
          {enrichResult.enriched} sesiones enriquecidas con transcript/notas
        </span>
      )}
      {enrichError && !enriching && (
        <span className="text-xs text-red-400 block">Error al enriquecer. Intenta de nuevo.</span>
      )}

      {/* Acciones */}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        {/* Sync */}
        <button
          onClick={onSync}
          disabled={syncing || enriching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
        >
          {syncing ? (
            <>
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Sincronizando…
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Sincronizar Meet
            </>
          )}
        </button>

        {/* Enrich */}
        <button
          onClick={onEnrich}
          disabled={syncing || enriching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
        >
          {enriching ? (
            <>
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Enriqueciendo…
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Enriquecer transcripts
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Estado no conectado ───────────────────────────────────────────────────────

function DisconnectedState() {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
        <svg
          className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="text-xs text-yellow-400/80">
          Faltan las variables de entorno para autenticación con Google Workspace.
        </p>
      </div>

      {/* Instrucciones */}
      <div className="rounded-lg bg-gray-800/60 border border-gray-700/50 p-3 space-y-1.5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Cómo conectar
        </p>
        <ol className="space-y-1">
          {[
            <>
              Crea un Service Account en{" "}
              <a
                href="https://console.cloud.google.com/iam-admin/serviceaccounts"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                Google Cloud Console
              </a>{" "}
              con Domain-Wide Delegation habilitado.
            </>,
            <>
              Otorga los scopes en{" "}
              <a
                href="https://admin.google.com/ac/owl/domainwidedelegation"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                Google Admin → Seguridad → DWD
              </a>
              : <code className="text-gray-300 text-2xs bg-gray-700 px-1 rounded">drive.readonly, documents.readonly, admin.directory.user.readonly, calendar.readonly</code>
            </>,
            <>
              Descarga la clave JSON del Service Account y agrega las variables al{" "}
              <code className="text-gray-300 bg-gray-700 px-1 py-0.5 rounded text-2xs">.env</code>:
            </>,
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-gray-700 flex items-center justify-center text-[9px] font-bold text-gray-500 mt-0.5">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 font-mono text-xs text-green-400 space-y-0.5">
          <div>GOOGLE_SERVICE_ACCOUNT_KEY=&apos;{"{"}&quot;type&quot;:&quot;service_account&quot;,...{"}"}&apos;</div>
          <div>GOOGLE_ADMIN_EMAIL=&quot;admin@tudominio.com&quot;</div>
        </div>
        <p className="text-xs text-gray-600 mt-1">
          Reinicia el servidor después de agregar las variables.
        </p>
      </div>
    </div>
  );
}
