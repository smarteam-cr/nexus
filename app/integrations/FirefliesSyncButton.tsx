"use client";

import { useState } from "react";

interface Props {
  initialCount: number;
}

export default function FirefliesSyncButton({ initialCount }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ synced: number; total: number } | null>(null);
  const [error, setError] = useState(false);
  const [count, setCount] = useState(initialCount);

  async function handleSync() {
    setSyncing(true);
    setError(false);
    setResult(null);
    try {
      const res = await fetch("/api/integrations/fireflies/sync", { method: "POST" });
      if (!res.ok) throw new Error("sync_failed");
      const data = (await res.json()) as { synced: number; alreadyExisted: number; total: number };
      setResult({ synced: data.synced, total: data.total });
      setCount(data.total);
    } catch {
      setError(true);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {count > 0 && (
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-400">{count}</span> sesiones en caché local
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-medium hover:bg-orange-500/20 disabled:opacity-50 transition-colors"
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sincronizar sesiones
            </>
          )}
        </button>

        {result && !syncing && (
          <span className="text-xs text-green-400">
            ✓ {result.synced} sesiones nuevas sincronizadas
          </span>
        )}
        {error && !syncing && (
          <span className="text-xs text-red-400">Error al sincronizar. Intenta de nuevo.</span>
        )}
      </div>
    </div>
  );
}
