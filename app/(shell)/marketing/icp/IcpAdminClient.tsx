"use client";

/**
 * CRUD del ICP (1 fila = 1 bullet), agrupado por sección — reusa el MISMO
 * componente visual que la vista de consumo (ICPView, 3 columnas + pills +
 * señales expandibles) con `editable` prendido: hover sobre un bullet muestra
 * editar/borrar, y cada sección tiene su propio "+ Agregar" inline. Ya no hay
 * una vista de administración separada (lista plana) — el ICP se ve y se
 * edita en el mismo lugar, en el mismo formato.
 */
import { useState, useEffect, useCallback } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, Skeleton, SkeletonText } from "@/components/ui";
import ICPView, { type IcpViewGroup } from "@/components/marketing/ICPView";
import type { IcpSection } from "@prisma/client";

export default function IcpAdminClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [groups, setGroups] = useState<IcpViewGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ sections: IcpViewGroup[] }>("/api/marketing/icp");
      setGroups(d.sections);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el ICP.");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (section: IcpSection, label: string) => {
    setBusy(true);
    try {
      await fetchJson("/api/marketing/icp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, label }),
      });
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo agregar.");
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async (id: string, label: string) => {
    setBusy(true);
    try {
      await fetchJson(`/api/marketing/icp/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
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

  // Skeleton ESTRUCTURAL: misma cáscara que el estado cargado (línea de ayuda +
  // columnas de secciones del ICP) para que al llegar la data nada salte.
  if (loading) {
    return (
      <div aria-label="Cargando el ICP">
        <Skeleton className="h-3 w-96 max-w-full" />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="bg-surface border border-line rounded-xl p-4 min-h-[220px]">
              <Skeleton className="h-3 w-32 mb-3" delay={i * 60} />
              <SkeletonText lines={5} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-fg-muted">
        Estos ítems alimentan al agente de contenido.
        {canEdit
          ? " Pasá el mouse sobre un ítem para editarlo o borrarlo, o usá \"+ Agregar\" en cada sección."
          : " Tu rol puede verlos pero no editarlos."}
      </p>

      <ICPView
        groups={groups}
        editable={canEdit}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={(id) => setConfirmDeleteId(id)}
        busy={busy}
      />

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
