"use client";

/**
 * Índice de documentos de Roles: perfiles de puesto Y propuestas de contratación. Lista +
 * alta de METADATOS (tipo, título, área, resumen) en un drawer; el CONTENIDO se edita
 * in-situ en su página (/roles/[id], con el motor de landing). Crear navega directo a esa
 * página (patrón business case: crear el shell → llenarlo en el workspace).
 *
 * `canEdit` viene del server (es SUPER_ADMIN): quien tiene documentos COMPARTIDOS entra
 * acá a leer, así que el alta, el activar/desactivar y el borrar no se le pintan.
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, EmptyState, Badge, Drawer, ListSkeleton } from "@/components/ui";
import { ROLE_DOC_TYPE_LABEL, type RoleDocTypeValue } from "@/lib/roles/schema";

type RoleRow = {
  id: string;
  docType: RoleDocTypeValue;
  title: string;
  area: string | null;
  summary: string | null;
  active: boolean;
};

interface MetaForm {
  docType: RoleDocTypeValue;
  title: string;
  area: string;
  summary: string;
}

const EMPTY_FORM: MetaForm = { docType: "PERFIL", title: "", area: "", summary: "" };

const INPUT_CLS =
  "w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand";

/** Qué se llena en cada tipo — el drawer lo dice para que la elección no sea a ciegas. */
const AYUDA_POR_TIPO: Record<RoleDocTypeValue, string> = {
  PERFIL:
    "Se abre su página para llenar las secciones del puesto (perfil, responsabilidades, el bloque 4DX, caminos de éxito y fracaso, ruta de madurez y transición).",
  PROPUESTA:
    "Se abre su página para llenar la propuesta (cómo es Smarteam, perfil, responsabilidades, la meta, sesiones de seguimiento y la propuesta económica).",
};

export default function RolesIndexClient({ canEdit = true }: { canEdit?: boolean }) {
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

  const openCreate = (docType: RoleDocTypeValue) => {
    setForm({ ...EMPTY_FORM, docType });
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
        body: JSON.stringify({
          docType: form.docType,
          title: form.title.trim(),
          area: clean(form.area),
          summary: clean(form.summary),
        }),
      });
      // El participio concuerda con el TIPO: "Perfil de puesto" es masculino y "Propuesta"
      // femenino — con un solo texto, uno de los dos sale mal escrito siempre.
      const creado = form.docType === "PERFIL" ? "creado" : "creada";
      toast.success(`${ROLE_DOC_TYPE_LABEL[form.docType]} ${creado}. Completa su contenido.`);
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
      {canEdit && (
        <div className="flex justify-end gap-2">
          {/* Dos botones y no un menú: son dos documentos distintos, no una variante de uno. */}
          <button
            onClick={() => openCreate("PERFIL")}
            className="px-4 py-2 text-sm rounded-lg border border-line text-fg-secondary hover:bg-surface-hover"
          >
            + Perfil de puesto
          </button>
          <button
            onClick={() => openCreate("PROPUESTA")}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-fg hover:bg-primary-hover"
          >
            + Propuesta
          </button>
        </div>
      )}

      {loading ? (
        // Skeleton estructural: replica la cáscara del estado cargado y reserva su altura
        // (patrón ProjectGPS.tsx). Nunca un <p>Cargando…</p> suelto.
        <ListSkeleton rows={3} lines={2} />
      ) : rows.length === 0 ? (
        <EmptyState
          variant="dashed"
          title={canEdit ? "Todavía no hay documentos" : "Todavía no hay nada compartido contigo"}
          description={
            canEdit
              ? "Crea el primero con los botones de arriba: un perfil de puesto documenta un rol del equipo; una propuesta se le presenta a alguien que está decidiendo si entra."
              : "Cuando alguien de dirección comparta un perfil de puesto o una propuesta, va a aparecer acá."
          }
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
                    {/* El TIPO va primero entre los chips: decide qué documento estás por abrir. */}
                    <Badge size="xs" className="ml-2">
                      {ROLE_DOC_TYPE_LABEL[r.docType]}
                    </Badge>
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
                    {canEdit ? "Abrir y editar" : "Abrir"}
                  </Link>
                  {canEdit && (
                    <>
                      <button onClick={() => toggleActive(r)} className="text-xs text-fg-muted hover:text-fg">
                        {r.active ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(r.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Borrar
                      </button>
                    </>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={form.docType === "PERFIL" ? "Nuevo perfil de puesto" : "Nueva propuesta"}
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
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-fg disabled:opacity-40 hover:bg-primary-hover"
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
          <p className="pt-1 text-[11px] text-fg-muted">{AYUDA_POR_TIPO[form.docType]}</p>
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
