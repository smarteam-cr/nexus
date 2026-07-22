"use client";

/**
 * Zona de peligro de un PROYECTO: eliminarlo de Nexus + desasociarlo de HubSpot.
 * Hard delete (cascade: handoff/cronograma/canvases/documentos/contexto/links de sesiones;
 * preserva facturación/action-items/alertas). Si el proyecto vino del sync de HubSpot, su
 * hubspotServiceId queda en la lista de ignorados del cliente → el sync NO lo vuelve a crear
 * (el deal en HubSpot queda intacto). Solo visible para roles con `deleteClients`
 * (CSL/SUPER_ADMIN), igual que borrar cliente.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useMe } from "@/hooks/useMe";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";

export default function DeleteProjectButton({
  clientId,
  projectId,
  projectName,
  hasHubspotLink,
  onDeleted,
}: {
  clientId: string;
  projectId: string;
  projectName: string;
  /** true = vino del sync (hubspotServiceId) → se desasocia y no se recrea. */
  hasHubspotLink: boolean;
  /** Se llama tras borrar (para cambiar de pestaña antes del refresh). */
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const me = useMe();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Cosmético: el server igual exige `deleteClients` en el DELETE.
  if (!me?.capabilities.includes("deleteClients")) return null;

  const handleDelete = async () => {
    setBusy(true);
    try {
      await fetchJson(`/api/clients/${clientId}/projects/${projectId}`, { method: "DELETE" });
      toast.success("Proyecto eliminado.");
      setConfirming(false);
      onDeleted?.();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar el proyecto.");
    }
    setBusy(false);
  };

  return (
    <div className="mx-6 my-6 rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">Zona de peligro</h3>
          <p className="text-[11px] text-fg-muted mt-0.5">
            Eliminar el proyecto borra su handoff, cronograma, canvases, documentos y contexto — no se
            puede deshacer.{" "}
            {hasHubspotLink
              ? "Se desasocia de HubSpot (el deal queda intacto) y el sync no lo vuelve a crear."
              : "No vino de HubSpot."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-500/30 hover:bg-red-500/10 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Eliminar proyecto
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
        title={`¿Eliminar «${projectName}»?`}
        description={
          `Se eliminará el proyecto junto con su handoff, cronograma, canvases, documentos y contexto. ` +
          (hasHubspotLink
            ? "Se desasociará de HubSpot (el deal queda intacto) y el sync no lo volverá a crear. "
            : "") +
          "Esta acción no se puede deshacer."
        }
        confirmLabel="Eliminar proyecto"
      />
    </div>
  );
}
