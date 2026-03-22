"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RefreshButton({ lastUpdated }: { lastUpdated: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await fetch("/api/hubspot/read", { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const timeAgo = (iso: string | null) => {
    if (!iso) return null;
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "hace un momento";
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.round(hrs / 24)}d`;
  };

  return (
    <div className="flex items-center gap-3">
      {lastUpdated && (
        <span className="text-xs text-gray-600">
          Actualizado {timeAgo(lastUpdated)}
        </span>
      )}
      <button
        onClick={handleRefresh}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-600 hover:bg-gray-800 text-gray-400 hover:text-white text-xs font-medium transition-colors disabled:opacity-50"
      >
        <svg
          className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {loading ? "Analizando..." : "Actualizar datos"}
      </button>
    </div>
  );
}
