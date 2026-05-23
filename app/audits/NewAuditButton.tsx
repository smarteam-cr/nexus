"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function NewAuditButton() {
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
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al crear auditoría");
      router.push(`/audits/${data.id}`);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex-shrink-0">
      <Button variant="primary" size="md" loading={loading} onClick={handleCreate}>
        {!loading && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        )}
        {loading ? "Capturando datos…" : "Nueva auditoría"}
      </Button>
      {error && (
        <p className="absolute top-full right-0 mt-1 text-xs text-red-400 whitespace-nowrap">
          {error}
        </p>
      )}
    </div>
  );
}
