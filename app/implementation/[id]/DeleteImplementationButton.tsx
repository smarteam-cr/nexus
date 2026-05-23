"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/components/ui";

interface Props {
  implementationId: string;
}

export default function DeleteImplementationButton({ implementationId }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    await fetch(`/api/implementations/${implementationId}`, { method: "DELETE" });
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setConfirming(true)}
        className="hover:text-red-400"
        title="Eliminar implementación"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        Eliminar
      </Button>

      <ConfirmDialog
        open={confirming}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
        title="¿Eliminar implementación?"
        description="Esta acción es permanente y no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </>
  );
}
