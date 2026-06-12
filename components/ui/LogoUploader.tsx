"use client";

/**
 * LogoUploader — uploader de imagen reusable (logo de cliente o de Smarteam).
 * Sube a un endpoint POST (FormData "file") que devuelve { logoUrl }, muestra
 * preview, y permite quitarlo (DELETE al mismo endpoint). Estilado con los tokens
 * semánticos del tema (bg-surface-muted / border-line / text-fg-muted) → legible
 * en claro y oscuro sin depender de la whitelist.
 */
import { useState, useRef } from "react";

export function LogoUploader({
  currentUrl,
  endpoint,
  label = "Logo",
  hint,
}: {
  currentUrl: string | null;
  /** Endpoint POST (subir) / DELETE (quitar). Ej: `/api/clients/abc/logo`. */
  endpoint: string;
  label?: string;
  hint?: string;
}) {
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "No se pudo subir el logo.");
        return;
      }
      setUrl(data.logoUrl ?? null);
    } catch {
      setError("Error de red al subir el logo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        setError("No se pudo quitar el logo.");
        return;
      }
      setUrl(null);
    } catch {
      setError("Error de red.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="max-h-12 max-w-24 object-contain" />
        ) : (
          <span className="text-xs text-fg-muted">Sin logo</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-light disabled:opacity-50"
          >
            {busy ? "Subiendo…" : url ? "Cambiar" : "Subir logo"}
          </button>
          {url && (
            <button
              onClick={remove}
              disabled={busy}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              Quitar
            </button>
          )}
        </div>
        {hint && <p className="mt-1.5 text-xs text-fg-muted">{hint}</p>}
        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={onFile}
          className="hidden"
        />
      </div>
    </div>
  );
}
