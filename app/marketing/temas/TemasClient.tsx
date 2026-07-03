"use client";

/**
 * Temas de contenido (antes "Pilares" — el modelo Prisma sigue llamándose
 * ContentPillar, esto es solo relabel de UI): bloque de SUGERENCIAS PENDING
 * del agente (aprobar = crea el tema y re-linkea ideas huérfanas; descartar)
 * + CRUD (crear/editar en panel lateral).
 */
import { useState, useEffect, useCallback } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, EmptyState, Badge, Drawer } from "@/components/ui";

interface PillarRow {
  id: string;
  name: string;
  description: string | null;
  origin: "HUMAN" | "AGENT";
  active: boolean;
  _count: { ideas: number };
}
interface SuggestionRow {
  id: string;
  name: string;
  description: string | null;
  rationale: string | null;
}

const EMPTY_FORM = { name: "", description: "" };

export default function TemasClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [pillars, setPillars] = useState<PillarRow[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ pillars: PillarRow[]; suggestions: SuggestionRow[] }>(
        "/api/marketing/pillars",
      );
      setPillars(d.pillars);
      setSuggestions(d.suggestions);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar los temas.");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const reviewSuggestion = async (id: string, action: "approve" | "discard") => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetchJson<{ ok: boolean; relinkedIdeas?: number }>(
        `/api/marketing/pillar-suggestions/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (action === "approve") {
        toast.success(
          `Tema creado${r.relinkedIdeas ? ` · ${r.relinkedIdeas} idea(s) re-vinculadas` : ""}.`,
        );
      } else {
        toast.info("Sugerencia descartada.");
      }
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo procesar.");
    } finally {
      setBusy(false);
    }
  };

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

  const startEdit = (r: PillarRow) => {
    setEditingId(r.id);
    setForm({ name: r.name, description: r.description ?? "" });
    setDrawerOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || busy) return;
    setBusy(true);
    try {
      const body = { name: form.name.trim(), description: form.description.trim() || null };
      if (editingId) {
        await fetchJson(`/api/marketing/pillars/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Tema actualizado.");
      } else {
        await fetchJson("/api/marketing/pillars", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Tema creado.");
      }
      closeDrawer();
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (r: PillarRow) => {
    try {
      await fetchJson(`/api/marketing/pillars/${r.id}`, {
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
      await fetchJson(`/api/marketing/pillars/${id}`, { method: "DELETE" });
      toast.info("Tema eliminado (sus ideas quedan sin tema, no se pierden).");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Sugerencias del agente */}
      {suggestions.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <p className="text-sm font-semibold text-fg mb-3">
            Sugerencias del agente <Badge size="xs">{suggestions.length}</Badge>
          </p>
          <ul className="space-y-3">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded-xl border border-line bg-surface px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{s.name}</p>
                    {s.description && <p className="mt-0.5 text-xs text-fg-secondary">{s.description}</p>}
                    {s.rationale && (
                      <p className="mt-1 text-xs text-fg-muted italic">Por qué: {s.rationale}</p>
                    )}
                  </div>
                  {canEdit && (
                    <span className="flex-shrink-0 flex gap-2">
                      <button
                        onClick={() => reviewSuggestion(s.id, "approve")}
                        disabled={busy}
                        className="px-3 py-1.5 text-xs rounded-lg bg-brand text-white hover:opacity-90 disabled:opacity-40"
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => reviewSuggestion(s.id, "discard")}
                        disabled={busy}
                        className="px-3 py-1.5 text-xs rounded-lg border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-40"
                      >
                        Descartar
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CRUD */}
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:opacity-90"
          >
            + Nuevo tema
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-fg-muted">Cargando…</p>
      ) : pillars.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Todavía no hay temas de contenido"
          description={canEdit ? "Creá el primero, o corré el motor: el agente puede sugerir temas." : "El equipo de Marketing todavía no cargó temas."}
        />
      ) : (
        <ul className="space-y-2">
          {pillars.map((r) => (
            <li key={r.id} className={`rounded-xl border border-line bg-surface px-4 py-3 ${r.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {r.name}
                    {r.origin === "AGENT" && (
                      <Badge size="xs" className="ml-2">
                        Sugerido por el agente
                      </Badge>
                    )}
                    {!r.active && (
                      <Badge size="xs" className="ml-2">
                        Inactivo
                      </Badge>
                    )}
                    <span className="ml-2 text-xs text-fg-muted">{r._count.ideas} idea(s)</span>
                  </p>
                  {r.description && <p className="mt-0.5 text-xs text-fg-secondary">{r.description}</p>}
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
        title={editingId ? "Editar tema" : "Nuevo tema"}
        footer={
          <>
            <button onClick={closeDrawer} className="px-4 py-2 text-sm rounded-lg border border-line text-fg-secondary hover:bg-surface-hover">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={busy || !form.name.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
            >
              {busy ? "Guardando…" : editingId ? "Guardar cambios" : "Crear tema"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre del tema (ej. IA aplicada a revenue)…"
            className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
            autoFocus
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Qué cubre este tema (opcional)…"
            rows={3}
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
        title="¿Borrar este tema?"
        description="Las ideas categorizadas en él quedan sin tema (no se borran)."
        confirmLabel="Borrar"
      />
    </div>
  );
}
