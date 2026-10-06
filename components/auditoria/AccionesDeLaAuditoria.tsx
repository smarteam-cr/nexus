"use client";

/**
 * Las acciones de la cabecera de una auditoría: volver a correrla (crea una auditoría nueva del
 * mismo portal, así queda la historia) y eliminarla (con confirmación). «Volver a correr» es un hook
 * porque lo usa también «Qué sigue».
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, useToast } from "@/components/ui";
import { BotonTexto } from "@/components/exploraciones/FranjaDeSugerencias";
import { candadoTomado, escucharElCandado, soltarCandado, tomarCandado } from "@/lib/auditoria-portal/candado-volver-a-correr";

/**
 * «Volver a correr» la auditoría `auditId`. ⛔ El candado es del MÓDULO, uno por auditoría
 * (lib/auditoria-portal/candado-volver-a-correr.ts): la cabecera y «Qué sigue» usan dos instancias de
 * este hook, y con un useRef cada una tenía el suyo — apretar una y después la otra creaba dos
 * auditorías. Los dos botones se apagan juntos.
 */
export function useVolverACorrer(auditId: string, clientId: string | null) {
  const router = useRouter();
  const toast = useToast();
  const corriendo = useSyncExternalStore(escucharElCandado, () => candadoTomado(auditId), () => false);
  // Si ESTA instancia tomó el candado, lo suelta al irse de la ficha: volver atrás deja correrla otra vez.
  const loTome = useRef(false);
  useEffect(
    () => () => {
      if (loTome.current) {
        loTome.current = false;
        soltarCandado(auditId);
      }
    },
    [auditId],
  );
  const correr = useCallback(async () => {
    if (!tomarCandado(auditId)) return;
    loTome.current = true;
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
      loTome.current = false;
      soltarCandado(auditId);
    }
  }, [auditId, clientId, router, toast]);
  return { correr, corriendo };
}

export default function AccionesDeLaAuditoria({
  auditId,
  clientId,
  puedeBorrar,
  versionAnterior = false,
}: {
  auditId: string;
  clientId: string | null;
  puedeBorrar: boolean;
  /** Una auditoría de antes del rediseño: lo que guardó (sus insights) no se puede volver a generar. */
  versionAnterior?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { correr, corriendo } = useVolverACorrer(auditId, clientId);
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
        description={
          versionAnterior
            ? "Es de la versión anterior: se borran sus totales, sus embudos, sus propietarios y los insights de la IA, que no se pueden volver a generar. Volver a correrla crea una auditoría nueva sin borrar esta. No se puede deshacer."
            : "Se borran la foto del portal, el análisis y lo que se marcó como revisado. No se puede deshacer."
        }
        confirmLabel="Eliminar"
        variant="destructive"
      />
    </>
  );
}
