"use client";

/**
 * HubspotCompanyPicker — busca y selecciona una empresa de HubSpot del cliente.
 * Usa GET /api/clients/[clientId]/hubspot-company/search (debounce). Si el cliente
 * no tiene HubSpot conectado, el endpoint devuelve 400 → el picker queda inerte.
 */
import { useState, useEffect, useRef } from "react";
import { fetchJson } from "@/lib/api/fetch-json";

type HsCompany = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
};

export type PickedCompany = { id: string; name: string };

export default function HubspotCompanyPicker({
  clientId,
  value,
  onChange,
  disabled,
}: {
  clientId: string;
  value: PickedCompany | null;
  onChange: (c: PickedCompany | null) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<HsCompany[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await fetchJson<HsCompany[]>(
          `/api/clients/${clientId}/hubspot-company/search?q=${encodeURIComponent(q.trim())}`,
        );
        if (!cancel) {
          setResults(Array.isArray(data) ? data : []);
          setOpen(true);
        }
      } catch {
        if (!cancel) setResults([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    }, 300);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [q, clientId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
        <span className="text-sm text-fg truncate">{value.name}</span>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-fg-muted hover:text-fg"
          >
            Cambiar
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={disabled}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Buscar empresa en HubSpot…"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand"
      />
      {open && (results.length > 0 || loading) && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-surface shadow-lg max-h-64 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-fg-muted">Buscando…</p>}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange({ id: c.id, name: c.name });
                setOpen(false);
                setQ("");
              }}
              className="block w-full text-left px-3 py-2 hover:bg-surface-hover"
            >
              <span className="text-sm text-fg">{c.name}</span>
              {c.domain && <span className="ml-2 text-xs text-fg-muted">{c.domain}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
