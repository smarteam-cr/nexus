"use client";

/**
 * PublishKickoffButton
 *
 * Barra de control para PUBLICAR / DESPUBLICAR el Kickoff al cliente externo.
 * Es una acción SEPARADA del acceso (token+password): el acceso puede existir
 * sin que el cliente vea nada; el Kickoff aparece solo cuando está publicado.
 *
 *   - Publicar    → POST   /api/projects/[id]/publish-kickoff
 *   - Despublicar → DELETE /api/projects/[id]/publish-kickoff
 *   - Estado      → GET    /api/projects/[id]/publish-kickoff
 *
 * Despublicar corta el acceso del cliente en el siguiente render (el chokepoint
 * externo re-chequea el flag en cada lectura). Se muestra solo en el canvas
 * Kickoff (lo monta ProjectCanvasPanel cuando ese canvas está activo).
 */
import { useState, useEffect, useCallback } from "react";

export function PublishKickoffButton({ projectId }: { projectId: string }) {
  const [published, setPublished] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/publish-kickoff`);
      if (!res.ok) {
        setPublished(false);
        return;
      }
      const data = await res.json();
      setPublished(!!data.published);
    } catch {
      setPublished(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = async () => {
    if (published === null || working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/publish-kickoff`, {
        method: published ? "DELETE" : "POST",
      });
      if (!res.ok) {
        alert("No se pudo cambiar el estado de publicación del Kickoff.");
        return;
      }
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  const isPublished = published === true;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <span
        className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${
          published === null ? "bg-gray-600" : isPublished ? "bg-emerald-400" : "bg-gray-500"
        }`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-200">
          {published === null
            ? "Cargando estado…"
            : isPublished
            ? "Kickoff publicado al cliente"
            : "Kickoff no publicado"}
        </p>
        <p className="text-xs text-gray-500">
          {isPublished
            ? "El cliente con acceso (token + contraseña) ve los bloques confirmados."
            : "El cliente no puede ver el Kickoff aunque tenga el acceso. Publicá cuando esté listo."}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={published === null || working}
        className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          isPublished
            ? "border border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
            : "bg-brand text-white hover:bg-brand/90"
        }`}
      >
        {working
          ? "Aplicando…"
          : isPublished
          ? "Despublicar"
          : "Publicar al cliente"}
      </button>
    </div>
  );
}
