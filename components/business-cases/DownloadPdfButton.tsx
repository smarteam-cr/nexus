"use client";

import { useState } from "react";
import { ApiError, extractErrorMessage } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";

// ── Descargar PDF (contenido vivo del canvas activo, mismo diseño de la landing) ──
export default function DownloadPdfButton({ bcId, canvasId }: { bcId: string; canvasId: string }) {
  const toast = useToast();
  const [working, setWorking] = useState(false);

  const download = async () => {
    if (working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/business-cases/${bcId}/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasId }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new ApiError(extractErrorMessage(payload), res.status, payload);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? "business-case.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF descargado.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo generar el PDF.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <button
      onClick={download}
      disabled={working}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium bg-surface-muted border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-50 transition-colors"
      title="Descargar el caso como PDF (contenido actual del canvas)"
    >
      {working ? (
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )}
      {working ? "Generando…" : "Descargar PDF"}
    </button>
  );
}
