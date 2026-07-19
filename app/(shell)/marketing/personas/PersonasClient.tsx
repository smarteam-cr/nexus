"use client";

/** CRUD de buyer personas (insumo del agente de contenido). Crear/editar vive
 * en un panel lateral (Drawer) — el CTA lo abre, el form no está siempre visible. */
import { useState, useEffect, useCallback } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, EmptyState, Badge, Drawer, CardsSkeleton } from "@/components/ui";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const closeDrawer = () => {
    setDrawerOpen(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setDrawerOpen(true);
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
    setDrawerOpen(true);
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
      closeDrawer();
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
        <div className="flex justify-end">
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:opacity-90"
          >
            + Nueva persona
          </button>
        </div>
      )}

      {loading ? (
        // Skeleton ESTRUCTURAL: cards de la altura de una persona cargada
        // (nombre + descripción + dolores/objetivos) para que nada salte.
        <div aria-label="Cargando las personas">
          <CardsSkeleton count={4} columns={2} minH="min-h-[160px]" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Todavía no hay buyer personas"
          description={canEdit ? "Creá la primera con el botón de arriba." : "El equipo de Marketing todavía no cargó personas."}
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

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingId ? "Editar persona" : "Nueva persona"}
        footer={
          <>
            <button onClick={closeDrawer} className="px-4 py-2 text-sm rounded-lg border border-line text-fg-secondary hover:bg-surface-hover">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={busy || !form.name.trim() || !form.description.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
            >
              {busy ? "Guardando…" : editingId ? "Guardar cambios" : "Crear persona"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre (ej. Director comercial LATAM)…"
            className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
            autoFocus
          />
          <input
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            placeholder="Cargo / segmento (opcional)…"
            className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Quién es, contexto…"
            rows={3}
            className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
          />
          <textarea
            value={form.pains}
            onChange={(e) => setForm({ ...form, pains: e.target.value })}
            placeholder="Dolores (opcional)…"
            rows={2}
            className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
          />
          <textarea
            value={form.goals}
            onChange={(e) => setForm({ ...form, goals: e.target.value })}
            placeholder="Objetivos (opcional)…"
            rows={2}
            className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
          />
        </div>
      </Drawer>

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
