"use client";

/**
 * Audiencia › Cliente ideal (/marketing/icp) — el ICP se ve y se edita en el mismo lugar, con el mismo componente
 * (ICPView): pasar el mouse sobre un ítem muestra editar y borrar, y cada sección tiene su «+ Agregar». Rediseño del
 * 2026-10-04: la página se llama «Audiencia» y trae las pestañas ICP / Buyer personas.
 */
import { useState, useEffect, useCallback } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, PageHeader, Skeleton, SkeletonPanel, SkeletonText } from "@/components/ui";
import AudienciaTabs from "@/components/marketing/AudienciaTabs";
import ICPView, { type IcpViewGroup } from "@/components/marketing/ICPView";
import type { IcpSection } from "@prisma/client";

export default function IcpAdminClient({ canEdit, conteos }: { canEdit: boolean; conteos: { icp: number; personas: number } }) {
  const toast = useToast();
  const [groups, setGroups] = useState<IcpViewGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmBorrar, setConfirmBorrar] = useState<string | null>(null);

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

  const agregar = async (section: IcpSection, label: string) => {
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

  const editar = async (id: string, label: string) => {
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

  const borrar = async (id: string) => {
    try {
      await fetchJson(`/api/marketing/icp/${id}`, { method: "DELETE" });
      toast.info("Ítem borrado.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar.");
    }
  };

  return (
    <>
      <PageHeader
        title="Audiencia"
        description={`A quién le escribe el agente: la empresa que buscamos y las personas que deciden la compra.${canEdit ? "" : " Tu rol puede verla pero no editarla."}`}
      />
      <div className="space-y-6">
        <AudienciaTabs icp={conteos.icp} personas={conteos.personas} />
        {loading ? (
          <div className="space-y-6" aria-label="Cargando el ICP">
            <SkeletonPanel minH="min-h-[420px]" header bodyClassName="grid gap-5 p-5 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="h-3 w-32" delay={i * 60} />
                  <SkeletonText lines={5} />
                </div>
              ))}
            </SkeletonPanel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonPanel key={i} minH="min-h-[160px]" bodyClassName="p-4 space-y-2">
                  <Skeleton className="h-4 w-24" delay={i * 40} />
                  <SkeletonText lines={3} />
                </SkeletonPanel>
              ))}
            </div>
          </div>
        ) : (
          <ICPView groups={groups} editable={canEdit} onAdd={agregar} onEdit={editar} onDelete={(id) => setConfirmBorrar(id)} busy={busy} />
        )}
      </div>

      <ConfirmDialog
        open={!!confirmBorrar}
        onCancel={() => setConfirmBorrar(null)}
        onConfirm={async () => {
          const id = confirmBorrar;
          setConfirmBorrar(null);
          if (id) await borrar(id);
        }}
        title="¿Borrar este ítem del ICP?"
        description="El agente deja de tenerlo en cuenta desde la próxima tanda. No se puede deshacer."
        confirmLabel="Borrar"
      />
    </>
  );
}
