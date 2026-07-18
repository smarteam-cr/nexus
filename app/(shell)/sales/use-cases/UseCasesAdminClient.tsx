"use client";

/**
 * UseCasesAdminClient — CRUD del catálogo de casos de uso (Ventas).
 * Lista con toggle activo + form de alta/edición (título, descripción, precio,
 * tipos de BC a los que aplica, tags del catálogo). DELETE solo sin referencias
 * (409 → el server sugiere desactivar).
 */
import { useCallback, useEffect, useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, ListSkeleton } from "@/components/ui";
import { BC_TYPE_CATALOG } from "@/lib/business-cases/case-types";
import { productTags, scopeTags } from "@/lib/tags/catalog";

type UseCaseRow = {
  id: string;
  title: string;
  description: string;
  price: string | null;
  appliesTo: string[];
  tags: string[];
  active: boolean;
  order: number;
};

const EMPTY_FORM = { title: "", description: "", price: "", appliesTo: [] as string[], tags: [] as string[] };

export default function UseCasesAdminClient() {
  const toast = useToast();
  const [rows, setRows] = useState<UseCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ useCases: UseCaseRow[] }>("/api/use-cases");
      setRows(d.useCases);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const toggleIn = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const startEdit = (r: UseCaseRow) => {
    setEditingId(r.id);
    setForm({ title: r.title, description: r.description, price: r.price ?? "", appliesTo: r.appliesTo, tags: r.tags });
  };
  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); };

  const save = async () => {
    if (!form.title.trim() || !form.description.trim() || busy) return;
    setBusy(true);
    try {
      const body = {
        title: form.title,
        description: form.description,
        price: form.price.trim() || null,
        appliesTo: form.appliesTo,
        tags: form.tags,
      };
      if (editingId) {
        await fetchJson(`/api/use-cases/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Caso de uso actualizado.");
      } else {
        await fetchJson("/api/use-cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Caso de uso creado.");
      }
      cancelEdit();
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (r: UseCaseRow) => {
    try {
      await fetchJson(`/api/use-cases/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !r.active }),
      });
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar.");
    }
  };

  const remove = async (id: string) => {
    try {
      await fetchJson(`/api/use-cases/${id}`, { method: "DELETE" });
      toast.info("Caso de uso eliminado.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar.");
    }
  };

  const allTags = [...productTags(), ...scopeTags()];
  const chip = (selectedList: string[], value: string) =>
    `px-2 py-1 rounded-full border text-[11px] cursor-pointer transition-colors ${
      selectedList.includes(value)
        ? "border-brand bg-brand/10 text-fg font-semibold"
        : "border-line text-fg-muted hover:text-fg"
    }`;

  return (
    <div className="space-y-6">
      {/* Form alta/edición */}
      <div className="rounded-2xl border border-line bg-surface p-5 space-y-3">
        <p className="text-sm font-semibold text-fg">{editingId ? "Editar caso de uso" : "Nuevo caso de uso"}</p>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Título (ej. Pipeline comercial con seguimiento automatizado)"
          className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
        />
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          placeholder="Descripción corta (el vendedor la ve en el checklist y puede entrar a la propuesta)…"
          className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand resize-y"
        />
        <input
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          placeholder='Precio (texto libre, ej. "USD 1.200" o "desde $500/mes") — opcional'
          className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
        />
        <div>
          <p className="text-2xs font-medium text-fg-muted uppercase tracking-wider mb-1.5">
            Aplica a (vacío = todos los tipos)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {BC_TYPE_CATALOG.map((t) => (
              <button key={t.id} type="button" className={chip(form.appliesTo, t.id)}
                onClick={() => setForm((f) => ({ ...f, appliesTo: toggleIn(f.appliesTo, t.id) }))}>
                {t.shortLabel}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-2xs font-medium text-fg-muted uppercase tracking-wider mb-1.5">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => (
              <button key={t.slug} type="button" className={chip(form.tags, t.slug)}
                onClick={() => setForm((f) => ({ ...f, tags: toggleIn(f.tags, t.slug) }))}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {editingId && (
            <button onClick={cancelEdit} className="text-xs text-fg-muted hover:text-fg px-3 py-1.5">
              Cancelar
            </button>
          )}
          <button
            onClick={save}
            disabled={busy || !form.title.trim() || !form.description.trim()}
            className="text-xs font-semibold text-white bg-brand hover:opacity-90 disabled:opacity-40 px-4 py-2 rounded-lg"
          >
            {busy ? "Guardando…" : editingId ? "Guardar cambios" : "Crear caso de uso"}
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <ListSkeleton rows={5} rowClassName="h-20" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No hay casos de uso todavía. Mientras el catálogo esté vacío, los business cases se generan
          igual que siempre (texto libre).
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className={`rounded-xl border border-line bg-surface px-4 py-3 ${r.active ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {r.title}
                    {r.price && (
                      <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full border border-line text-fg-muted">{r.price}</span>
                    )}
                    {!r.active && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-fg-muted">inactivo</span>
                    )}
                  </p>
                  <p className="text-xs text-fg-muted mt-0.5 line-clamp-2">{r.description}</p>
                  <p className="text-[11px] text-fg-muted mt-1">
                    Aplica a: {r.appliesTo.length ? r.appliesTo.join(", ") : "todos los tipos"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => startEdit(r)} className="text-xs text-fg-muted hover:text-fg px-2 py-1">
                    Editar
                  </button>
                  <button onClick={() => toggleActive(r)} className="text-xs text-fg-muted hover:text-fg px-2 py-1">
                    {r.active ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => setConfirmDeleteId(r.id)} className="text-xs text-fg-muted hover:text-red-600 px-2 py-1">
                    Borrar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          if (id) await remove(id);
        }}
        title="¿Borrar este caso de uso?"
        description="Solo se puede borrar si ningún business case lo tiene seleccionado (si no, desactivalo)."
        confirmLabel="Borrar"
      />
    </div>
  );
}
