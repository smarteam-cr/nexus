"use client";

/**
 * CRUD de perfiles de puesto (Roles). Crear/editar vive en un panel lateral
 * (Drawer). Cada rol se abre como su propia página web (/roles/[id]). Sin IA —
 * se llena a mano con markdown en las 6 secciones fijas de la plantilla.
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, EmptyState, Badge, Drawer } from "@/components/ui";
import { ROLE_SECTIONS, type RoleSectionKey } from "@/lib/roles/schema";

interface RoleRow {
  id: string;
  title: string;
  area: string | null;
  summary: string | null;
  profile: string | null;
  responsibilities: string | null;
  kpis: string | null;
  successPaths: string | null;
  failurePaths: string | null;
  maturityPath: string | null;
  active: boolean;
}

type SectionForm = Record<RoleSectionKey, string>;
interface RoleForm extends SectionForm {
  title: string;
  area: string;
  summary: string;
}

const EMPTY_FORM: RoleForm = {
  title: "",
  area: "",
  summary: "",
  profile: "",
  responsibilities: "",
  kpis: "",
  successPaths: "",
  failurePaths: "",
  maturityPath: "",
};

const INPUT_CLS =
  "w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand";

export default function RolesIndexClient() {
  const toast = useToast();
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<RoleForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editHandled, setEditHandled] = useState(false);
  const searchParams = useSearchParams();
  const editParam = searchParams.get("edit");

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ roles: RoleRow[] }>("/api/roles");
      setRows(d.roles);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar los roles.");
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

  const startEdit = (r: RoleRow) => {
    setEditingId(r.id);
    setForm({
      title: r.title,
      area: r.area ?? "",
      summary: r.summary ?? "",
      profile: r.profile ?? "",
      responsibilities: r.responsibilities ?? "",
      kpis: r.kpis ?? "",
      successPaths: r.successPaths ?? "",
      failurePaths: r.failurePaths ?? "",
      maturityPath: r.maturityPath ?? "",
    });
    setDrawerOpen(true);
  };

  // Abrir el drawer de edición si venimos de /roles/[id] con ?edit=<id> (una vez).
  useEffect(() => {
    if (editHandled || !editParam || rows.length === 0) return;
    const r = rows.find((x) => x.id === editParam);
    if (r) {
      startEdit(r);
      setEditHandled(true);
    }
  }, [editHandled, editParam, rows]);

  const save = async () => {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    try {
      const clean = (s: string) => s.trim() || null;
      const body = {
        title: form.title.trim(),
        area: clean(form.area),
        summary: clean(form.summary),
        profile: clean(form.profile),
        responsibilities: clean(form.responsibilities),
        kpis: clean(form.kpis),
        successPaths: clean(form.successPaths),
        failurePaths: clean(form.failurePaths),
        maturityPath: clean(form.maturityPath),
      };
      if (editingId) {
        await fetchJson(`/api/roles/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Rol actualizado.");
      } else {
        await fetchJson("/api/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast.success("Rol creado.");
      }
      closeDrawer();
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (r: RoleRow) => {
    try {
      await fetchJson(`/api/roles/${r.id}`, {
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
      await fetchJson(`/api/roles/${id}`, { method: "DELETE" });
      toast.info("Rol eliminado.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={openCreate}
          className="px-4 py-2 text-sm rounded-lg bg-brand text-white hover:opacity-90"
        >
          + Nuevo rol
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-fg-muted">Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Todavía no hay roles"
          description="Creá el primero con el botón de arriba. Cada rol se ve como una página resumida del puesto."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`rounded-xl border border-line bg-surface px-4 py-3 ${r.active ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {r.title}
                    {r.area && <span className="ml-2 text-xs text-fg-muted">{r.area}</span>}
                    {!r.active && (
                      <Badge size="xs" className="ml-2">
                        Inactivo
                      </Badge>
                    )}
                  </p>
                  {r.summary && <p className="mt-1 text-xs text-fg-secondary">{r.summary}</p>}
                </div>
                <span className="flex-shrink-0 flex items-center gap-2">
                  <Link href={`/roles/${r.id}`} className="text-xs text-brand hover:underline">
                    Ver página
                  </Link>
                  <button onClick={() => startEdit(r)} className="text-xs text-fg-muted hover:text-fg">
                    Editar
                  </button>
                  <button onClick={() => toggleActive(r)} className="text-xs text-fg-muted hover:text-fg">
                    {r.active ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(r.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Borrar
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingId ? "Editar rol" : "Nuevo rol"}
        footer={
          <>
            <button
              onClick={closeDrawer}
              className="px-4 py-2 text-sm rounded-lg border border-line text-fg-secondary hover:bg-surface-hover"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={busy || !form.title.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
            >
              {busy ? "Guardando…" : editingId ? "Guardar cambios" : "Crear rol"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Nombre del puesto (ej. CSE)…"
              className={INPUT_CLS}
              autoFocus
            />
            <input
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="Área (opcional, ej. Customer Success)…"
              className={INPUT_CLS}
            />
          </div>
          <input
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            placeholder="Resumen de una línea (subtítulo)…"
            className={INPUT_CLS}
          />
          <p className="pt-1 text-[11px] text-fg-muted">
            Las 6 secciones aceptan markdown (viñetas con <code>-</code>, negrita con{" "}
            <code>**texto**</code>). Dejá vacía la que no aplique.
          </p>
          {ROLE_SECTIONS.map((s) => (
            <div key={s.key}>
              <label className="block text-[11px] font-medium text-fg-muted mb-1">{s.label}</label>
              <textarea
                value={form[s.key]}
                onChange={(e) => setForm({ ...form, [s.key]: e.target.value })}
                rows={4}
                placeholder={`${s.label} (markdown)…`}
                className={INPUT_CLS}
              />
            </div>
          ))}
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
        title="¿Borrar este rol?"
        description="Se elimina su página. Esta acción no se puede deshacer."
        confirmLabel="Borrar"
      />
    </div>
  );
}
