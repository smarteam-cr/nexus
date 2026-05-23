"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui";

export default function DeleteClientButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
        title="Eliminar cliente"
        className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      <ConfirmDialog
        open={confirming}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
        title="¿Eliminar cliente?"
        description={
          clientName
            ? `Se eliminará "${clientName}" junto con sus auditorías, implementaciones y documentos.`
            : "El cliente y todos sus datos asociados se eliminarán permanentemente."
        }
        confirmLabel="Eliminar"
      />
    </>
  );
}
