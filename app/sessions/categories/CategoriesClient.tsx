"use client";

import { useState } from "react";
import Link from "next/link";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  slug: string;
  domains: string[];
  kind: string;
  color: string | null;
  order: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialCategories: Category[];
}

interface DraftCategory {
  name: string;
  slug: string;
  domainsText: string;
  kind: string;
  color: string;
}

const EMPTY_DRAFT: DraftCategory = {
  name: "",
  slug: "",
  domainsText: "",
  kind: "custom",
  color: "#6366F1",
};

const KIND_LABELS: Record<string, { label: string; color: string }> = {
  internal: { label: "Interna", color: "#94A3B8" },
  partner:  { label: "Partner", color: "#F59E0B" },
  custom:   { label: "Custom",  color: "#6366F1" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function parseDomains(text: string): string[] {
  return text
    .split(/[,\n\s]+/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CategoriesClient({ initialCategories }: Props) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftCategory>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setShowForm(true);
    setError(null);
  }

  function startEdit(cat: Category) {
    setDraft({
      name: cat.name,
      slug: cat.slug,
      domainsText: cat.domains.join(", "),
      kind: cat.kind,
      color: cat.color ?? "#6366F1",
    });
    setEditingId(cat.id);
    setShowForm(true);
    setError(null);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    setBusy(true);
    try {
      const domains = parseDomains(draft.domainsText);
      if (domains.length === 0) {
        throw new Error("Debe ingresar al menos un dominio (separados por coma o salto de línea)");
      }
      if (!draft.name.trim()) {
        throw new Error("El nombre es requerido");
      }
      const slug = draft.slug.trim() || slugify(draft.name);

      const payload = {
        name: draft.name.trim(),
        slug,
        domains,
        kind: draft.kind,
        color: draft.color,
      };

      if (editingId) {
        const res = await fetch(`/api/session-categories/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Error al actualizar");
        }
        const updated = await res.json();
        setCategories((prev) =>
          prev.map((c) => (c.id === editingId ? { ...c, ...updated, createdAt: c.createdAt, updatedAt: new Date().toISOString() } : c))
        );
      } else {
        const res = await fetch(`/api/session-categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? "Error al crear");
        }
        const created = await res.json();
        setCategories((prev) => [
          ...prev,
          {
            ...created,
            createdAt: created.createdAt ?? new Date().toISOString(),
            updatedAt: created.updatedAt ?? new Date().toISOString(),
          },
        ]);
      }
      cancelForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(cat: Category) {
    if (cat.isDefault) return;
    if (!confirm(`¿Eliminar la categoría "${cat.name}"? Las sesiones que la usaban quedarán sin clasificar.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/session-categories/${cat.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al eliminar");
      }
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Header */}
      <header className="px-8 pt-8 pb-6 border-b border-gray-800">
        <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
          <Link href="/sessions" className="hover:text-gray-300 transition-colors">
            Sesiones
          </Link>
          <span>·</span>
          <span>Categorías</span>
        </div>
        <h1 className="text-xl font-semibold text-white">Categorías de sesiones</h1>
        <p className="mt-1 text-sm text-gray-500 max-w-2xl">
          Las categorías agrupan sesiones por dominio de los participantes externos.
          Usalas para clasificar sesiones internas, con partners, o cualquier otra agrupación
          que no sea un cliente Nexus.
        </p>
      </header>

      {/* Toolbar */}
      <div className="px-8 py-4 flex items-center justify-between">
        <p className="text-xs text-gray-600">
          {categories.length} categoría{categories.length !== 1 ? "s" : ""}
        </p>
        {!showForm && (
          <button
            onClick={startCreate}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-brand/20 text-brand-light border border-brand/30 hover:bg-brand/30 transition-colors"
          >
            + Nueva categoría
          </button>
        )}
      </div>

      {/* Form (crear / editar) */}
      {showForm && (
        <div className="mx-8 mb-6 p-5 rounded-lg border border-gray-800 bg-gray-900/40">
          <h2 className="text-sm font-semibold text-white mb-4">
            {editingId ? "Editar categoría" : "Nueva categoría"}
          </h2>

          {error && (
            <div className="mb-3 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nombre</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => {
                  const name = e.target.value;
                  // auto-slug solo si el slug está vacío o coincide con el slug autogenerado del nombre anterior
                  setDraft((d) => ({
                    ...d,
                    name,
                    slug: !d.slug || d.slug === slugify(d.name) ? slugify(name) : d.slug,
                  }));
                }}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-800 text-sm text-white focus:outline-none focus:border-brand"
                placeholder="Partner HubSpot"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Slug</label>
              <input
                type="text"
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-800 text-sm text-white font-mono focus:outline-none focus:border-brand"
                placeholder="partner-hubspot"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">
                Dominios <span className="text-gray-700">(separar con coma o salto de línea)</span>
              </label>
              <textarea
                rows={2}
                value={draft.domainsText}
                onChange={(e) => setDraft((d) => ({ ...d, domainsText: e.target.value }))}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-800 text-sm text-white font-mono focus:outline-none focus:border-brand"
                placeholder="hubspot.com, hubspotcr.com"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo</label>
              <select
                value={draft.kind}
                onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-800 text-sm text-white focus:outline-none focus:border-brand"
              >
                <option value="internal">Interna (dominios del equipo)</option>
                <option value="partner">Partner (empresa aliada)</option>
                <option value="custom">Custom (otra agrupación)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Color del tag</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className="w-10 h-9 rounded border border-gray-800 bg-gray-900 cursor-pointer"
                />
                <input
                  type="text"
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className="flex-1 px-3 py-2 rounded bg-gray-900 border border-gray-800 text-sm text-white font-mono focus:outline-none focus:border-brand"
                  placeholder="#6366F1"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              onClick={cancelForm}
              disabled={busy}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={busy}
              className="px-4 py-1.5 text-xs font-medium rounded-md bg-brand/20 text-brand-light border border-brand/30 hover:bg-brand/30 disabled:opacity-50 transition-colors"
            >
              {busy ? "Guardando..." : editingId ? "Guardar cambios" : "Crear categoría"}
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="px-8 pb-12">
        {categories.length === 0 ? (
          <p className="text-sm text-gray-600 py-12 text-center">
            No hay categorías. Creá la primera con el botón de arriba.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Nombre</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Tipo</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Dominios</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => {
                  const kindMeta = KIND_LABELS[cat.kind] ?? { label: cat.kind, color: "#888" };
                  return (
                    <tr key={cat.id} className="border-b border-gray-800/60 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cat.color ?? kindMeta.color }}
                          />
                          <span className="text-white font-medium">{cat.name}</span>
                          {cat.isDefault && (
                            <span className="text-[10px] uppercase tracking-wider text-gray-600 ml-1">
                              default
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 font-mono mt-0.5">{cat.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
                          style={{
                            color: kindMeta.color,
                            backgroundColor: `${kindMeta.color}15`,
                          }}
                        >
                          {kindMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {cat.domains.map((d) => (
                            <span
                              key={d}
                              className="px-2 py-0.5 rounded text-[10px] font-mono bg-gray-900 border border-gray-800 text-gray-400"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => startEdit(cat)}
                            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                          >
                            Editar
                          </button>
                          {!cat.isDefault && (
                            <button
                              onClick={() => handleDelete(cat)}
                              disabled={busy}
                              className="text-xs text-red-400/70 hover:text-red-300 transition-colors disabled:opacity-40"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
