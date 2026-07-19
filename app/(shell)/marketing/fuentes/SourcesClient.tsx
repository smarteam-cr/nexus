"use client";

/**
 * Fuentes de inspiración (perfiles públicos de LinkedIn). CRUD (crear en
 * panel lateral) + estado de la última ingesta por fuente (lastFetchedAt /
 * lastFetchError).
 */
import { useState, useEffect, useCallback } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, EmptyState, Badge, Drawer, ListSkeleton } from "@/components/ui";

interface SourceRow {
  id: string;
  profileUrl: string;
  label: string | null;
  active: boolean;
  lastFetchedAt: string | null;
  lastFetchError: string | null;
  _count: { posts: number };
}

const EMPTY_FORM = { profileUrl: "", label: "" };

export default function SourcesClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ sources: SourceRow[] }>("/api/marketing/sources");
      setRows(d.sources);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las fuentes.");
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
  };

  const add = async () => {
    if (!form.profileUrl.trim() || busy) return;
    setBusy(true);
    try {
      await fetchJson("/api/marketing/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileUrl: form.profileUrl.trim(),
          label: form.label.trim() || null,
        }),
      });
      toast.success("Fuente agregada.");
      closeDrawer();
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo agregar.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (r: SourceRow) => {
    try {
      await fetchJson(`/api/marketing/sources/${r.id}`, {
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
      await fetchJson(`/api/marketing/sources/${id}`, { method: "DELETE" });
      toast.info("Fuente eliminada (con sus posts).");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-fg-muted max-w-xl">
          Perfiles públicos de LinkedIn que la ingesta scrapea (~20 posts recientes por corrida, sin duplicar).
          Recomendado: 5–10 fuentes activas.
        </p>
        {canEdit && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex-shrink-0 px-4 py-2 text-sm rounded-lg bg-brand text-white hover:opacity-90"
          >
            + Nueva fuente
          </button>
        )}
      </div>

      {loading ? (
        // Skeleton estructural: misma cáscara que la lista de fuentes (filas
        // rounded-xl de ~3 líneas) para que al llegar la data nada salte.
        <ListSkeleton rows={5} lines={2} />
      ) : rows.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Todavía no hay fuentes de inspiración"
          description={canEdit ? "Agregá 5-10 perfiles de LinkedIn para alimentar el motor." : "El equipo de Marketing todavía no cargó fuentes."}
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className={`rounded-xl border border-line bg-surface px-4 py-3 ${r.active ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg truncate">
                    {r.label || r.profileUrl.replace(/^https?:\/\/(www\.)?/, "")}
                    {!r.active && (
                      <Badge size="xs" className="ml-2">
                        Inactiva
                      </Badge>
                    )}
                  </p>
                  <a
                    href={r.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-fg-muted hover:text-fg truncate block"
                  >
                    {r.profileUrl}
                  </a>
                  <p className="mt-1 text-xs text-fg-muted">
                    {r._count.posts} post(s) guardados ·{" "}
                    {r.lastFetchedAt
                      ? `última ingesta ${new Date(r.lastFetchedAt).toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" })}`
                      : "sin ingestas todavía"}
                  </p>
                  {r.lastFetchError && (
                    <p className="mt-1 text-xs text-red-400">Último error: {r.lastFetchError}</p>
                  )}
                </div>
                {canEdit && (
                  <span className="flex-shrink-0 flex items-center gap-2">
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
        title="Nueva fuente"
        description="Un perfil o company público de LinkedIn."
        footer={
          <>
            <button onClick={closeDrawer} className="px-4 py-2 text-sm rounded-lg border border-line text-fg-secondary hover:bg-surface-hover">
              Cancelar
            </button>
            <button
              onClick={add}
              disabled={busy || !form.profileUrl.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
            >
              {busy ? "Agregando…" : "Agregar fuente"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <input
            value={form.profileUrl}
            onChange={(e) => setForm({ ...form, profileUrl: e.target.value })}
            placeholder="https://www.linkedin.com/in/…"
            className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted"
            autoFocus
          />
          <input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Etiqueta (opcional)…"
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
        title="¿Borrar esta fuente?"
        description="Se borran también sus posts guardados. Esta acción no se puede deshacer."
        confirmLabel="Borrar"
      />
    </div>
  );
}
