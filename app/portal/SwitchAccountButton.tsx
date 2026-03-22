"use client";

import { useState } from "react";

export default function SwitchAccountButton() {
  const [loading, setLoading] = useState(false);

  const handleSwitch = async () => {
    setLoading(true);
    try {
      // Clear session then redirect to OAuth
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/api/auth/hubspot";
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleSwitch}
      disabled={loading}
      title="Conectar otra cuenta de HubSpot"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-brand/40 hover:bg-brand/5 text-gray-500 hover:text-brand-light text-xs font-medium transition-colors disabled:opacity-40"
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
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
      {loading ? "Redirigiendo..." : "Cambiar cuenta"}
    </button>
  );
}
