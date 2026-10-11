"use client";

/**
 * components/clients/DocumentUpload.tsx — Información del cliente › Documentos: los documentos de la
 * EMPRESA (2026-10-07). Lista lo subido acá, lo subido en el «Contexto adicional» de cualquier pieza
 * (preventa o proyecto) y lo que adjuntó el cliente en el cuestionario, cada uno con de dónde vino.
 * Lo que se sube acá queda en el proyecto de estrategia (`projectId`), que es la casa de la empresa.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Alert, IconCheck } from "@/components/ui";
import { subirDirecto } from "@/lib/storage/subir-directo";

interface ProjectDocument {
  id: string;
  title: string;
  type: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  downloadUrl: string | null;
  hasContent: boolean;
  createdAt: string;
  /** De dónde vino: «Subido en el contexto del cronograma», «Proyecto X», el cuestionario. */
  deDonde: string | null;
  borrable: boolean;
}

const FILE_ICONS: Record<string, string> = {
  "application/pdf": "📕",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📊",
  "application/vnd.ms-excel": "📊",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📝",
  "application/msword": "📝",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "📑",
  "application/vnd.ms-powerpoint": "📑",
  "text/plain": "📄",
  "text/csv": "📊",
  "image/png": "🖼️",
  "image/jpeg": "🖼️",
  "image/webp": "🖼️",
  // Google Workspace nativos (docs agregados por link)
  "application/vnd.google-apps.document": "📘",
  "application/vnd.google-apps.spreadsheet": "📗",
  "application/vnd.google-apps.presentation": "📙",
};

// Etiqueta legible del tipo de archivo agregado por link.
const GOOGLE_TYPE_LABEL: Record<string, string> = {
  "application/vnd.google-apps.document": "Google Doc",
  "application/vnd.google-apps.spreadsheet": "Google Sheet",
  "application/vnd.google-apps.presentation": "Google Slides",
  "text/html": "Página web",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentUpload({ projectId }: { projectId: string }) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado del input de link de Google
  const [linkUrl, setLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/documents`);
      const data = await res.json();
      setDocuments(data.documents ?? []);
    } catch {
      /* la lista queda como estaba; el próximo intento dice lo que pase */
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga la lista al montar; el setState llega después del fetch
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    for (const file of Array.from(files)) {
      setUploadProgress(`Subiendo ${file.name}...`);

      // Directo a Supabase: el VPS corta todo cuerpo de más de 1 MB (lib/storage/subida-directa.ts).
      const r = await subirDirecto({ ruta: `/api/projects/${projectId}/documents/upload`, archivo: file });
      if (!r.ok) setError(`${file.name}: ${r.error}`);
    }

    setUploadProgress(null);
    setUploading(false);
    await fetchDocuments();
  };

  const handleAddLink = async () => {
    const url = linkUrl.trim();
    if (!url || addingLink) return;

    setAddingLink(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/documents/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo agregar el enlace");
      } else {
        setLinkUrl("");
        // El backend deduplica por URL: si ya existía, lo actualiza (re-lee
        // el contenido) en vez de duplicar. Avisamos cuál de los dos pasó.
        setInfo(data.updated ? "Ese documento ya estaba agregado — se actualizó su contenido." : "Documento agregado.");
        await fetchDocuments();
      }
    } catch {
      setError("Error de conexión");
    }

    setAddingLink(false);
  };

  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/documents`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "No se pudo eliminar.");
        return;
      }
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      setError("No se pudo eliminar: revisa la conexión.");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleUpload(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      {/* Upload area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line px-4 py-6 transition-colors hover:border-fg-muted hover:bg-surface-hover"
      >
        <svg className="h-6 w-6 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-xs text-fg-muted">{uploading ? uploadProgress : "Arrastra archivos o haz clic para subir"}</p>
        <p className="text-center text-[10px] text-fg-muted">
          PDF, Excel, Word, CSV, imágenes · Max 10MB. Aquí también quedan los que subes en el «Contexto adicional» de la
          preventa o de un proyecto.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.txt,.csv,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {/* Pegar enlace de Google Drive / Docs / Slides / Sheets */}
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddLink();
          }}
          disabled={addingLink}
          placeholder="Pegar enlace de Google (Docs/Slides/Sheets) o página web…"
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          onClick={handleAddLink}
          disabled={addingLink || !linkUrl.trim()}
          className="flex-shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {addingLink ? "Leyendo…" : "Agregar"}
        </button>
      </div>

      {error && (
        <Alert variant="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {info && (
        <Alert variant="warning" onDismiss={() => setInfo(null)}>
          {info}
        </Alert>
      )}

      {/* Document list */}
      {documents.length > 0 && (
        <div className="space-y-1.5">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="group flex items-center gap-3 rounded-xl bg-surface-muted px-3 py-2.5 transition-colors hover:bg-surface-hover"
            >
              <span className="flex-shrink-0 text-lg">
                {FILE_ICONS[doc.mimeType ?? ""] ?? (doc.type === "URL" ? "🔗" : "📎")}
              </span>
              <div className="min-w-0 flex-1">
                {doc.downloadUrl ? (
                  <a
                    href={doc.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-xs font-medium text-fg hover:text-brand"
                  >
                    {doc.fileName ?? doc.title}
                  </a>
                ) : (
                  <p className="truncate text-xs font-medium text-fg">{doc.fileName ?? doc.title}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-fg-muted">
                  {/* Tipo de Google (docs por link) o tamaño (archivos subidos) */}
                  {doc.type === "URL" && GOOGLE_TYPE_LABEL[doc.mimeType ?? ""] ? (
                    <span className="text-brand">{GOOGLE_TYPE_LABEL[doc.mimeType ?? ""]}</span>
                  ) : doc.type === "URL" ? (
                    <span className="text-brand">Enlace</span>
                  ) : null}
                  {doc.fileSize && <span>{formatSize(doc.fileSize)}</span>}
                  {doc.hasContent ? (
                    <span className="inline-flex items-center gap-1 text-success-ink">
                      <IconCheck className="h-3 w-3" />
                      Texto extraído
                    </span>
                  ) : doc.type === "URL" ? (
                    <span className="text-warn-ink">sin texto</span>
                  ) : null}
                  <span>{new Date(doc.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
                  {doc.deDonde && <span>· {doc.deDonde}</span>}
                </div>
              </div>
              {doc.borrable && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(doc.id);
                  }}
                  className="rounded p-1 text-fg-muted opacity-0 transition-colors hover:bg-danger-surface hover:text-danger-ink group-hover:opacity-100"
                  title="Eliminar"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
