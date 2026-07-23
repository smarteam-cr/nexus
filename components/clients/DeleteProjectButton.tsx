"use client";

/**
 * Botón compacto "Eliminar proyecto" (+ ConfirmDialog). Vive en la Zona de peligro de la
 * configuración del cliente, uno por proyecto. Hard delete (cascade: handoff/cronograma/
 * canvases/documentos/contexto/links de sesiones; preserva facturación/action-items/alertas).
 * Si el proyecto vino del sync de HubSpot (hubspotServiceId), se DESASOCIA: su id queda en
 * la lista de ignorados del cliente → el sync NO lo vuelve a crear (el deal queda intacto).
 * El gate real (`deleteClients`) lo aplican el server y la sección que lo contiene.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
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
  /** Se llama tras borrar (para refrescar la lista). */
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

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
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/10 disabled:opacity-50 transition-colors"
      >
        Eliminar
      </button>

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
    </>
  );
}
