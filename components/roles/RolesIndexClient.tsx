"use client";

/**
 * Índice de perfiles de puesto (Roles). Lista + alta de METADATOS (título, área,
 * resumen) en un drawer; el CONTENIDO de cada rol se edita in-situ en su página
 * (/roles/[id], con el motor de landing). Crear un rol navega directo a su página
 * para llenarlo (patrón business case: crear el shell → editar en el workspace).
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, EmptyState, Badge, Drawer } from "@/components/ui";

type RoleRow = {
  id: string;
  title: string;
  area: string | null;
  summary: string | null;
  active: boolean;
};

interface MetaForm {
  title: string;
  area: string;
  summary: string;
}

const EMPTY_FORM: MetaForm = { title: "", area: "", summary: "" };

const INPUT_CLS =
  "w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand";

export default function RolesIndexClient() {
  const toast = useToast();
  const router = useRouter();
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<MetaForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setForm(EMPTY_FORM);
  };

  // Crear el rol (solo metadatos) y navegar a su página para llenar el contenido in-situ.
  const create = async () => {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    try {
      const clean = (s: string) => s.trim() || null;
      const { role } = await fetchJson<{ role: { id: string } }>("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title.trim(), area: clean(form.area), summary: clean(form.summary) }),
      });
      toast.success("Rol creado. Completá su contenido.");
      router.push(`/roles/${role.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear.");
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
                    Abrir y editar
                  </Link>
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
        title="Nuevo rol"
        footer={
          <>
            <button
              onClick={closeDrawer}
              className="px-4 py-2 text-sm rounded-lg border border-line text-fg-secondary hover:bg-surface-hover"
            >
              Cancelar
            </button>
            <button
              onClick={create}
              disabled={busy || !form.title.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
            >
              {busy ? "Creando…" : "Crear y abrir"}
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
            Al crearlo se abre su página para llenar las secciones (perfil, responsabilidades,
            KPIs, caminos de éxito y fracaso, ruta de madurez y transición) con cards, tablas y
            edición directa.
          </p>
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
