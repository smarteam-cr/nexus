"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/documents`);
      const data = await res.json();
      setDocuments(data.documents ?? []);
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    for (const file of Array.from(files)) {
      setUploadProgress(`Subiendo ${file.name}...`);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch(`/api/projects/${projectId}/documents/upload`, {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Error al subir archivo");
        }
      } catch {
        setError("Error de conexión");
      }
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
        await fetchDocuments();
      }
    } catch {
      setError("Error de conexión");
    }

    setAddingLink(false);
  };

  const handleDelete = async (docId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/documents`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch { /* ignore */ }
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
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-xs text-gray-400">
          {uploading ? uploadProgress : "Arrastra archivos o haz clic para subir"}
        </p>
        <p className="text-[10px] text-gray-300">PDF, Excel, Word, CSV, imágenes · Max 10MB</p>
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
          onKeyDown={(e) => { if (e.key === "Enter") handleAddLink(); }}
          disabled={addingLink}
          placeholder="Pegar enlace de Google (Docs/Slides/Sheets) o página web…"
          className="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white text-gray-800 placeholder:text-gray-400 focus:border-gray-400 focus:ring-1 focus:ring-gray-300 disabled:bg-gray-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleAddLink}
          disabled={addingLink || !linkUrl.trim()}
          className="px-3 py-2 text-xs font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex-shrink-0"
        >
          {addingLink ? "Leyendo…" : "Agregar"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Document list */}
      {documents.length > 0 && (
        <div className="space-y-1.5">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group"
            >
              <span className="text-lg flex-shrink-0">
                {FILE_ICONS[doc.mimeType ?? ""] ?? (doc.type === "URL" ? "🔗" : "📎")}
              </span>
              <div className="flex-1 min-w-0">
                {doc.downloadUrl ? (
                  <a
                    href={doc.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-gray-800 hover:text-brand truncate block"
                  >
                    {doc.fileName ?? doc.title}
                  </a>
                ) : (
                  <p className="text-xs font-medium text-gray-800 truncate">{doc.fileName ?? doc.title}</p>
                )}
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  {/* Tipo de Google (docs por link) o tamaño (archivos subidos) */}
                  {doc.type === "URL" && GOOGLE_TYPE_LABEL[doc.mimeType ?? ""] ? (
                    <span className="text-blue-500">{GOOGLE_TYPE_LABEL[doc.mimeType ?? ""]}</span>
                  ) : doc.type === "URL" ? (
                    <span className="text-blue-500">Enlace</span>
                  ) : null}
                  {doc.fileSize && <span>{formatSize(doc.fileSize)}</span>}
                  {doc.hasContent ? (
                    <span className="text-green-500">✓ Texto extraído</span>
                  ) : doc.type === "URL" ? (
                    <span className="text-amber-500">sin texto</span>
                  ) : null}
                  <span>{new Date(doc.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                title="Eliminar"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
