"use client";

/**
 * Botón "Eliminar business case" — ícono de basurero + ConfirmDialog + toast.
 * Reusable en la lista (refresca tras borrar) y en el workspace (redirectTo="/business-cases").
 * El DELETE borra el caso y, por cascade, sus canvases/secciones/bloques/sesiones/transcripts/acceso.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";

export default function DeleteBusinessCaseButton({
  bcId,
  description,
  redirectTo,
  className,
}: {
  bcId: string;
  /** Texto del confirm. Default genérico. */
  description?: string;
  /** Si se pasa, navega ahí tras borrar; si no, refresca la vista actual (lista). */
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    try {
      await fetchJson(`/api/business-cases/${bcId}`, { method: "DELETE" });
      toast.success("Business case eliminado.");
      setConfirming(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar el business case.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // En la lista el botón vive junto a un <Link>: cortamos navegación + burbujeo.
          e.preventDefault();
          e.stopPropagation();
          setConfirming(true);
        }}
        title="Eliminar business case"
        className={
          className ??
          "flex-shrink-0 p-1.5 rounded-md text-fg-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
        }
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      <ConfirmDialog
        open={confirming}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
        title="¿Eliminar business case?"
        description={
          description ??
          "Se eliminará el caso junto con sus casos de uso (canvas), secciones y contenido. Esta acción no se puede deshacer."
        }
        confirmLabel="Eliminar"
      />
    </>
  );
}
