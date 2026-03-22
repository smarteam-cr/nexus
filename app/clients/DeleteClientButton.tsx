"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui";

export default function DeleteClientButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      router.refresh();
    } catch {
      setLoading(false);
    }
  };

  if (confirming) {
    return (
      <div
        className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-xl bg-gray-900/95 backdrop-blur-sm"
        onClick={(e) => e.preventDefault()}
      >
        <span className="text-xs text-gray-400">¿Eliminar?</span>
        <Button
          variant="destructive-solid"
          size="xs"
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? <Spinner size="xs" /> : "Sí"}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => setConfirming(false)}
          disabled={loading}
        >
          No
        </Button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        setConfirming(true);
      }}
      title="Eliminar cliente"
      className="absolute right-9 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-gray-700 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  );
}
