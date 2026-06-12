"use client";

/**
 * PublishSurfaceButton (D.1.5)
 *
 * Control genérico de PUBLICAR / DESPUBLICAR una superficie externa del
 * proyecto (kickoff, cronograma, …). La publicación es una acción SEPARADA del
 * acceso (token+password): el acceso puede existir sin que el cliente vea
 * nada; cada superficie aparece solo cuando SU flag está seteado. Despublicar
 * corta el acceso en el siguiente render — los chokepoints re-chequean el flag
 * en CADA lectura.
 *
 * Contrato del endpoint (espejo publish-kickoff / publish-timeline):
 *   GET → { published, publishedAt } · POST → publica · DELETE → despublica
 */
import { useState, useEffect, useCallback } from "react";

export interface PublishSurfaceCopy {
  /** Título cuando está publicado — ej. "Kickoff publicado al cliente". */
  published: string;
  /** Título cuando NO está publicado. */
  unpublished: string;
  /** Subtexto cuando está publicado. */
  publishedHint: string;
  /** Subtexto cuando NO está publicado. */
  unpublishedHint: string;
}

export function PublishSurfaceButton({
  projectId,
  endpoint,
  copy,
  className = "",
}: {
  projectId: string;
  /** Segmento bajo /api/projects/[id]/ — ej. "publish-kickoff" | "publish-timeline". */
  endpoint: string;
  copy: PublishSurfaceCopy;
  /** Margen externo a cargo del caller (el padre puede espaciar con space-y). */
  className?: string;
}) {
  const [published, setPublished] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/${endpoint}`);
      if (!res.ok) {
        setPublished(false);
        return;
      }
      const data = await res.json();
      setPublished(!!data.published);
    } catch {
      setPublished(false);
    }
  }, [projectId, endpoint]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = async () => {
    if (published === null || working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/${endpoint}`, {
        method: published ? "DELETE" : "POST",
      });
      if (!res.ok) {
        alert("No se pudo cambiar el estado de publicación.");
        return;
      }
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  const isPublished = published === true;

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3 ${className}`}>
      <span
        className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${
          published === null ? "bg-gray-600" : isPublished ? "bg-emerald-400" : "bg-gray-500"
        }`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg-secondary">
          {published === null ? "Cargando estado…" : isPublished ? copy.published : copy.unpublished}
        </p>
        <p className="text-xs text-fg-muted">
          {isPublished ? copy.publishedHint : copy.unpublishedHint}
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
        {working ? "Aplicando…" : isPublished ? "Despublicar" : "Publicar al cliente"}
      </button>
    </div>
  );
}
