"use client";

/** Voz / posicionamiento de marca (campo único). El agente la lee para dar el tono. */
import { useState, useEffect, useCallback } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Skeleton, SkeletonText } from "@/components/ui";

export default function VoiceClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ brandVoice: string }>("/api/marketing/voice");
      setValue(d.brandVoice);
      setSaved(d.brandVoice);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar la voz.");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      const d = await fetchJson<{ brandVoice: string }>("/api/marketing/voice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandVoice: value.trim() }),
      });
      setSaved(d.brandVoice);
      setValue(d.brandVoice);
      toast.success("Voz de marca guardada.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  // Skeleton ESTRUCTURAL: misma cáscara que el estado cargado (línea de ayuda +
  // textarea rounded-2xl + botón) para que al llegar la data nada salte.
  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl" aria-label="Cargando la voz de marca">
        <Skeleton className="h-3 w-96 max-w-full" />
        <div className="bg-surface border border-line rounded-2xl p-4 min-h-[280px]">
          <SkeletonText lines={6} />
        </div>
        <Skeleton className="h-9 w-24" rounded="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-xs text-fg-muted">
        El agente de contenido lee este texto para calibrar el tono de TODAS las ideas.
        {!canEdit && " Tu rol puede verlo pero no editarlo."}
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={8}
        readOnly={!canEdit}
        className="w-full px-4 py-3 text-sm bg-surface border border-line rounded-2xl text-fg leading-relaxed"
      />
      {canEdit && (
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy || !value.trim() || value.trim() === saved.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
          {value.trim() !== saved.trim() && (
            <button
              onClick={() => setValue(saved)}
              className="text-xs text-fg-muted hover:text-fg"
            >
              Descartar cambios
            </button>
          )}
        </div>
      )}
    </div>
  );
}
