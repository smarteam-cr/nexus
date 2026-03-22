"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Props {
  clientId: string;
  stage: number;
  step: number;
  placeholder?: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function StageNoteEditor({ clientId, stage, step, placeholder }: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  // Cargar nota al montar
  useEffect(() => {
    setLoading(true);
    setContent("");
    setSaveStatus("idle");

    fetch(`/api/clients/${clientId}/stage-notes?stage=${stage}&step=${step}`)
      .then((r) => r.json())
      .then((data) => {
        const val = data.content ?? "";
        setContent(val);
        lastSavedRef.current = val;
      })
      .catch(() => {/* ignorar */})
      .finally(() => setLoading(false));
  }, [clientId, stage, step]);

  // Auto-save con debounce de 800ms
  const save = useCallback(async (value: string) => {
    if (value === lastSavedRef.current) return;
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/clients/${clientId}/stage-notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, step, content: value }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      lastSavedRef.current = value;
      setSaveStatus("saved");
      // Volver a idle después de 2 segundos
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }, [clientId, stage, step]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);
    setSaveStatus("idle");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(value), 800);
  };

  // Guardar al desmontar si hay cambios pendientes
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2">
      <textarea
        value={content}
        onChange={handleChange}
        placeholder={placeholder ?? "Escribe tus notas aquí..."}
        className="flex-1 w-full min-h-[300px] px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 text-gray-100 placeholder-gray-600 text-sm leading-relaxed focus:outline-none focus:border-gray-700 focus:ring-1 focus:ring-gray-700/50 transition-colors resize-none font-sans"
      />
      {/* Indicador de guardado */}
      <div className="flex items-center justify-end h-4">
        {saveStatus === "saving" && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-2.5 h-2.5 border border-gray-500 border-t-transparent rounded-full animate-spin" />
            Guardando...
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="flex items-center gap-1 text-xs text-green-500">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Guardado
          </span>
        )}
        {saveStatus === "error" && (
          <span className="text-xs text-red-400">Error al guardar</span>
        )}
      </div>
    </div>
  );
}
