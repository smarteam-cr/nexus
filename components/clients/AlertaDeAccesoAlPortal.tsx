"use client";

/**
 * components/clients/AlertaDeAccesoAlPortal.tsx — el acceso al portal de HubSpot que el cliente todavía no nos dio (Elías,
 * 30 oct): era una franja adentro del kickoff y pasó a ser una alerta en el Resumen, con su ícono en la fila «Resumen» de la
 * barra lateral. Sale con la misma regla que el recordatorio de «Para ti»: el kickoff lo pide y sigue pendiente.
 *
 * UI interna: primitivas y tokens, tuteo.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

/** El estado del acceso. `clave` lo vuelve a leer: cada vez que se entra al Resumen, por si el kickoff se publicó recién. */
export function useAccesoAlPortal(projectId: string, clave: unknown) {
  const [pendiente, setPendiente] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/acceso-al-portal`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { dadoEn?: string | null; pedidoDesde?: string | null } | null) => vivo && setPendiente(!!j && !j.dadoEn && !!j.pedidoDesde))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId, clave]);
  return { pendiente, setPendiente };
}

export default function AlertaDeAccesoAlPortal({ projectId, onCambio }: { projectId: string; onCambio: (pendiente: boolean) => void }) {
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();
  const marcar = useCallback(
    async (dado: boolean) => {
      setGuardando(true);
      try {
        const r = await fetch(`/api/projects/${projectId}/acceso-al-portal`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dado }),
        });
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        if (!r.ok) return toast.error(j?.error ?? "No se pudo guardar. Vuelve a intentarlo.");
        onCambio(!dado);
        if (dado) toast.success("Listo: el acceso al portal quedó marcado.", { action: { label: "Deshacer", onClick: () => void marcar(false) } });
      } catch {
        toast.error("Error de conexión.");
      } finally {
        setGuardando(false);
      }
    },
    [projectId, onCambio, toast],
  );
  return (
    <Alert
      variant="warning"
      title="Falta el acceso al portal de HubSpot del cliente"
      action={
        <Button size="xs" variant="primary" loading={guardando} onClick={() => void marcar(true)}>
          Ya nos dio acceso
        </Button>
      }
    >
      El kickoff se lo pide. Mientras falte, te lo recuerda «Para ti».
    </Alert>
  );
}
