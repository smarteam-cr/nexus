"use client";

/**
 * Las acciones de la cabecera de una auditoría: volver a correrla (crea una auditoría nueva del
 * mismo portal, así queda la historia) y eliminarla (con confirmación). «Volver a correr» es un hook
 * porque lo usa también «Qué sigue».
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, useToast } from "@/components/ui";
import { BotonTexto } from "@/components/exploraciones/FranjaDeSugerencias";

export function useVolverACorrer(clientId: string | null) {
  const router = useRouter();
  const toast = useToast();
  const [corriendo, setCorriendo] = useState(false);
  const correr = useCallback(async () => {
    setCorriendo(true);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientId ? { clientId } : {}),
      });
      const d = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !d.id) throw new Error(d.error ?? "No se pudo crear la auditoría");
      router.push(`/audits/${d.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear la auditoría");
      setCorriendo(false);
    }
  }, [clientId, router, toast]);
  return { correr, corriendo };
}

export default function AccionesDeLaAuditoria({ auditId, clientId, puedeBorrar }: { auditId: string; clientId: string | null; puedeBorrar: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { correr, corriendo } = useVolverACorrer(clientId);
  const [confirmando, setConfirmando] = useState(false);

  const borrar = async () => {
    const res = await fetch(`/api/audits/${auditId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("No se pudo eliminar la auditoría");
      return;
    }
    router.push("/audits");
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        disabled={corriendo}
        onClick={() => void correr()}
        className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
      >
        {corriendo ? "Creando…" : "Volver a correr"}
      </button>
      {puedeBorrar && <BotonTexto onClick={() => setConfirmando(true)}>Eliminar</BotonTexto>}
      <ConfirmDialog
        open={confirmando}
        onCancel={() => setConfirmando(false)}
        onConfirm={borrar}
        title="¿Eliminar esta auditoría?"
        description="Se borran la foto del portal, el análisis y lo que se marcó como revisado. No se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
      />
    </>
  );
}
