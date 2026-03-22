"use client";

import { useState, useEffect, useCallback } from "react";

interface Document {
  id: string;
  title: string;
  type: "CALL_TRANSCRIPT" | "BRIEF" | "FREE_TEXT" | "URL";
  content: string | null;
  url: string | null;
  createdAt: string;
}

interface Props {
  clientId: string;
  stage?: number;
  step?: number;
  /** Si es true, muestra documentos globales (stage=null) */
  global?: boolean;
  /** Filtra por proyecto específico */
  projectId?: string;
  /** Callback llamado cada vez que cambia el número de documentos */
  onCountChange?: (count: number) => void;
}

const TYPE_LABELS: Record<Document["type"], string> = {
  URL: "Enlace",
  CALL_TRANSCRIPT: "Transcripción",
  BRIEF: "Brief",
  FREE_TEXT: "Texto libre",
};

const TYPE_ICONS: Record<Document["type"], React.ReactNode> = {
  URL: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  CALL_TRANSCRIPT: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  ),
  BRIEF: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  FREE_TEXT: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
};

export default function ClientDocuments({ clientId, stage, step, global: isGlobal, projectId, onCountChange }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchDocs = useCallback(async () => {
    const url = new URL(`/api/clients/${clientId}/documents`, window.location.origin);
    if (isGlobal) {
      url.searchParams.set("stage", "global");
    } else if (stage !== undefined) {
      url.searchParams.set("stage", String(stage));
    }
    if (step) url.searchParams.set("step", String(step));
    if (projectId) url.searchParams.set("projectId", projectId);

    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      setDocuments(data);
      onCountChange?.(data.length);
    }
    setLoading(false);
  }, [clientId, stage, step, projectId, onCountChange]);

  useEffect(() => {
    setLoading(true);
    fetchDocs();
  }, [fetchDocs]);

  const handleDelete = async (docId: string) => {
    if (!confirm("¿Eliminar este documento?")) return;
    const res = await fetch(`/api/clients/${clientId}/documents/${docId}`, { method: "DELETE" });
    if (res.ok) {
      setDocuments((prev) => {
        const updated = prev.filter((d) => d.id !== docId);
        onCountChange?.(updated.length);
        return updated;
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Lista de documentos */}
      {loading ? (
        <div className="flex items-center justify-center h-20">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-24 rounded-xl border border-dashed border-gray-800 text-gray-600 text-sm gap-1">
          <svg className="w-5 h-5 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Sin documentos aún
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} onDelete={() => handleDelete(doc.id)} />
          ))}
        </div>
      )}

      {/* Botón agregar */}
      {showForm ? (
        <AddDocumentForm
          clientId={clientId}
          stage={isGlobal ? undefined : stage}
          step={step}
          projectId={projectId}
          onSaved={() => { setShowForm(false); fetchDocs(); }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-700 hover:border-brand/40 hover:bg-brand/5 text-gray-500 hover:text-brand-light transition-all text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Agregar documento
        </button>
      )}
    </div>
  );
}

// ── Card de documento ──────────────────────────────────────────────────────────

function DocumentCard({ doc, onDelete }: { doc: Document; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex-shrink-0 text-gray-500">{TYPE_ICONS[doc.type]}</span>
        <div className="flex-1 min-w-0">
          {doc.type === "URL" && doc.url ? (
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300 underline truncate block"
            >
              {doc.title}
            </a>
          ) : (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-sm text-gray-200 hover:text-white text-left truncate block w-full"
            >
              {doc.title}
            </button>
          )}
          <span className="text-xs text-gray-600">{TYPE_LABELS[doc.type]}</span>
        </div>
        <button
          onClick={onDelete}
          className="flex-shrink-0 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {expanded && doc.content && (
        <div className="px-3 pb-3 border-t border-gray-800">
          <p className="text-xs text-gray-400 mt-2 whitespace-pre-wrap leading-relaxed">{doc.content}</p>
        </div>
      )}
    </div>
  );
}

// ── Formulario para agregar documento ─────────────────────────────────────────

function AddDocumentForm({
  clientId,
  stage,
  step,
  projectId,
  onSaved,
  onCancel,
}: {
  clientId: string;
  stage?: number;
  step?: number;
  projectId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<Document["type"]>("URL");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/clients/${clientId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: stage ?? null,
          step: step ?? undefined,
          projectId: projectId ?? undefined,
          title: title.trim(),
          type,
          url: type === "URL" ? url.trim() : undefined,
          content: type !== "URL" ? content.trim() : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al agregar");
        return;
      }

      onSaved();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg bg-gray-900 border border-gray-800 p-4 space-y-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título del documento"
            required
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-brand/50 transition-colors"
          />
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as Document["type"])}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-sm focus:outline-none focus:border-brand/50 transition-colors"
        >
          <option value="URL">Enlace URL</option>
          <option value="CALL_TRANSCRIPT">Transcripción</option>
          <option value="BRIEF">Brief</option>
          <option value="FREE_TEXT">Texto libre</option>
        </select>
      </div>

      {type === "URL" ? (
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          required
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-brand/50 transition-colors"
        />
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Contenido del documento..."
          rows={4}
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-brand/50 transition-colors resize-none"
        />
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 text-xs font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-light disabled:bg-brand/40 text-white text-xs font-medium transition-colors"
        >
          {loading ? "Agregando..." : "Agregar"}
        </button>
      </div>
    </form>
  );
}
