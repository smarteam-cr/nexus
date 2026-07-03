"use client";

/** CRUD de buyer personas (insumo del agente de contenido). */
import { useState, useEffect, useCallback } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, EmptyState, Badge } from "@/components/ui";

interface PersonaRow {
  id: string;
  name: string;
  role: string | null;
  description: string;
  pains: string | null;
  goals: string | null;
  active: boolean;
}

const EMPTY_FORM = { name: "", role: "", description: "", pains: "", goals: "" };

export default function PersonasClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<PersonaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ personas: PersonaRow[] }>("/api/marketing/personas");
      setRows(d.personas);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las personas.");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const cancelEdit = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const startEdit = (r: PersonaRow) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      role: r.role ?? "",
      description: r.description,
      pains: r.pains ?? "",
      goals: r.goals ?? "",
    });
  };

  const save = async () => {
    if (!form.name.trim() || !form.description.trim() || busy) return;
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        role: form.role.trim() || null,
        description: form.description.trim(),
        pains: form.pains.trim() || null,
        goals: form.goals.trim() || null,
      };
      if (editingId) {
        await fetchJson(`/api/marketing/personas/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Persona actualizada.");
      } else {
        await fetchJson("/api/marketing/personas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Persona creada.");
      }
      cancelEdit();
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (r: PersonaRow) => {
    try {
      await fetchJson(`/api/marketing/personas/${r.id}`, {
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
      await fetchJson(`/api/marketing/personas/${id}`, { method: "DELETE" });
      toast.info("Persona eliminada.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar.");
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="rounded-2xl border border-line bg-surface p-5 space-y-3">
          <p className="text-sm font-semibold text-fg">{editingId ? "Editar persona" : "Nueva persona"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre (ej. Director comercial LATAM)…"
              className="px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
            />
            <input
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="Cargo / segmento (opcional)…"
              className="px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
            />
          </div>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Quién es, contexto…"
            rows={3}
            className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <textarea
              value={form.pains}
              onChange={(e) => setForm({ ...form, pains: e.target.value })}
              placeholder="Dolores (opcional)…"
              rows={2}
              className="px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
            />
            <textarea
              value={form.goals}
              onChange={(e) => setForm({ ...form, goals: e.target.value })}
              placeholder="Objetivos (opcional)…"
              rows={2}
              className="px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy || !form.name.trim() || !form.description.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
            >
              {busy ? "Guardando…" : editingId ? "Guardar cambios" : "Crear persona"}
            </button>
            {editingId && (
              <button onClick={cancelEdit} className="px-4 py-2 text-sm rounded-lg border border-line text-fg-secondary hover:bg-surface-hover">
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-fg-muted">Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Todavía no hay buyer personas"
          description={canEdit ? "Creá la primera con el formulario de arriba." : "El equipo de Marketing todavía no cargó personas."}
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className={`rounded-xl border border-line bg-surface px-4 py-3 ${r.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {r.name}
                    {r.role && <span className="ml-2 text-xs text-fg-muted">{r.role}</span>}
                    {!r.active && (
                      <Badge size="xs" className="ml-2">
                        Inactiva
                      </Badge>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-fg-secondary whitespace-pre-wrap">{r.description}</p>
                  {r.pains && <p className="mt-1 text-xs text-fg-muted"><span className="font-medium">Dolores:</span> {r.pains}</p>}
                  {r.goals && <p className="mt-1 text-xs text-fg-muted"><span className="font-medium">Objetivos:</span> {r.goals}</p>}
                </div>
                {canEdit && (
                  <span className="flex-shrink-0 flex items-center gap-2">
                    <button onClick={() => startEdit(r)} className="text-xs text-fg-muted hover:text-fg">
                      Editar
                    </button>
                    <button onClick={() => toggleActive(r)} className="text-xs text-fg-muted hover:text-fg">
                      {r.active ? "Desactivar" : "Activar"}
                    </button>
                    <button onClick={() => setConfirmDeleteId(r.id)} className="text-xs text-red-400 hover:text-red-300">
                      Borrar
                    </button>
                  </span>
                )}
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
        title="¿Borrar esta persona?"
        description="El agente dejará de considerarla. Esta acción no se puede deshacer."
        confirmLabel="Borrar"
      />
    </div>
  );
}
