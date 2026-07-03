"use client";

/**
 * CRUD del ICP (1 fila = 1 bullet), agrupado por sección. La vista bonita para
 * consumo vive en /icp (ICPView); acá es administración pura. Editar un bullet
 * existente sigue siendo inline (texto corto); agregar uno nuevo abre el panel
 * lateral con la sección ya fijada.
 */
import { useState, useEffect, useCallback } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, Drawer } from "@/components/ui";
import { ICP_SECTION_META, ICP_SECTION_ORDER } from "@/lib/marketing/seed-data";
import type { IcpSection } from "@prisma/client";

interface IcpItemRow {
  id: string;
  label: string;
  order: number;
}
interface SectionGroup {
  section: IcpSection;
  items: IcpItemRow[];
}

export default function IcpAdminClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [sections, setSections] = useState<SectionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [drawerSection, setDrawerSection] = useState<IcpSection | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ sections: SectionGroup[] }>("/api/marketing/icp");
      setSections(d.sections);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el ICP.");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const closeDrawer = () => {
    setDrawerSection(null);
    setNewLabel("");
  };

  const add = async () => {
    const label = newLabel.trim();
    if (!label || !drawerSection || busy) return;
    setBusy(true);
    try {
      await fetchJson("/api/marketing/icp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: drawerSection, label }),
      });
      closeDrawer();
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo agregar.");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editingId || !editingLabel.trim() || busy) return;
    setBusy(true);
    try {
      await fetchJson(`/api/marketing/icp/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editingLabel.trim() }),
      });
      setEditingId(null);
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await fetchJson(`/api/marketing/icp/${id}`, { method: "DELETE" });
      toast.info("Ítem eliminado.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar.");
    }
  };

  if (loading) return <p className="text-sm text-fg-muted">Cargando…</p>;

  return (
    <div className="space-y-5">
      <p className="text-xs text-fg-muted">
        Estos ítems alimentan al agente de contenido y se muestran en la página <span className="font-medium text-fg-secondary">ICP</span> (visible para todo el equipo).
        {!canEdit && " Tu rol puede verlos pero no editarlos."}
      </p>

      {ICP_SECTION_ORDER.map((sectionKey) => {
        const group = sections.find((s) => s.section === sectionKey);
        const meta = ICP_SECTION_META[sectionKey];
        return (
          <div key={sectionKey} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-fg-muted">
                {meta.label}
              </p>
              {canEdit && (
                <button
                  onClick={() => setDrawerSection(sectionKey)}
                  className="text-xs text-brand hover:underline"
                >
                  + Agregar
                </button>
              )}
            </div>
            <ul className="space-y-1.5">
              {(group?.items ?? []).map((item) => (
                <li key={item.id} className="flex items-start gap-2 group">
                  <span className="flex-shrink-0 mt-2 w-1 h-1 rounded-full bg-fg-muted" />
                  {editingId === item.id ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        className="flex-1 px-2 py-1 text-sm bg-surface border border-line rounded-lg text-fg"
                        autoFocus
                      />
                      <button onClick={saveEdit} disabled={busy} className="text-xs text-brand hover:underline">
                        Guardar
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-fg-muted hover:underline">
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-fg-secondary leading-relaxed">{item.label}</span>
                      {canEdit && (
                        <span className="flex-shrink-0 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingId(item.id);
                              setEditingLabel(item.label);
                            }}
                            className="text-xs text-fg-muted hover:text-fg"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Borrar
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </li>
              ))}
              {(group?.items ?? []).length === 0 && (
                <li className="text-xs text-fg-muted italic">Sin ítems en esta sección.</li>
              )}
            </ul>
          </div>
        );
      })}

      <Drawer
        open={!!drawerSection}
        onClose={closeDrawer}
        title="Nuevo ítem del ICP"
        description={drawerSection ? ICP_SECTION_META[drawerSection].label : undefined}
        footer={
          <>
            <button onClick={closeDrawer} className="px-4 py-2 text-sm rounded-lg border border-line text-fg-secondary hover:bg-surface-hover">
              Cancelar
            </button>
            <button
              onClick={add}
              disabled={busy || !newLabel.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
            >
              {busy ? "Agregando…" : "Agregar"}
            </button>
          </>
        }
      >
        <textarea
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Texto del ítem…"
          rows={3}
          className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
          autoFocus
        />
      </Drawer>

      <ConfirmDialog
        open={!!confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          if (id) await remove(id);
        }}
        title="¿Borrar este ítem del ICP?"
        description="El agente de contenido dejará de considerarlo. Esta acción no se puede deshacer."
        confirmLabel="Borrar"
      />
    </div>
  );
}
