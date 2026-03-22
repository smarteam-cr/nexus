"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  clientId: string;
  stage: number;
}

export default function NewAuditButtonClient({ clientId, stage }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al crear auditoría");
      }
      const auditStep = stage === 1 ? 2 : 0;
      router.push(`/clients/${clientId}/stage/${stage}?step=${auditStep}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleCreate}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-800 text-gray-300 hover:text-white text-sm font-medium transition-all disabled:opacity-50"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            Capturando datos...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva auditoría
          </>
        )}
      </button>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
