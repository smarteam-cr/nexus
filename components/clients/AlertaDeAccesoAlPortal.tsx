"use client";

/**
 * components/clients/AlertaDeAccesoAlPortal.tsx — el acceso al portal de HubSpot del cliente, en el Resumen (Elías, 30 oct):
 * era una franja adentro del kickoff. Pendiente es una alerta, con su ícono en la fila «Resumen» de la barra lateral, con la
 * misma regla que el recordatorio de «Para ti» (`falta`, lib/kickoff/acceso-al-portal.ts). Dado, una línea con la fecha y
 * «Volver a pendiente», por si se marcó por error.
 *
 * UI interna: primitivas y tokens, tuteo.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

interface EstadoDelAcceso {
  falta: boolean;
  dadoEn: string | null;
  diasHabiles: number | null;
}

/** El estado del acceso. `clave` lo vuelve a leer: cada vez que se entra al Resumen, por si el kickoff se publicó recién. */
export function useAccesoAlPortal(projectId: string, clave: unknown) {
  const [acceso, setAcceso] = useState<EstadoDelAcceso | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/acceso-al-portal`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: EstadoDelAcceso | null) => vivo && setAcceso(j))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId, clave]);
  return { acceso, setAcceso };
}

export default function AlertaDeAccesoAlPortal({ projectId, acceso, onCambio }: { projectId: string; acceso: EstadoDelAcceso; onCambio: (a: EstadoDelAcceso) => void }) {
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
        const j = (await r.json().catch(() => null)) as (EstadoDelAcceso & { error?: string }) | null;
        if (!r.ok || !j) return toast.error(j?.error ?? "No se pudo guardar. Vuelve a intentarlo.");
        onCambio(j);
      } catch {
        toast.error("Error de conexión.");
      } finally {
        setGuardando(false);
      }
    },
    [projectId, onCambio, toast],
  );
  if (acceso.dadoEn) {
    const fecha = new Date(acceso.dadoEn).toLocaleDateString("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Costa_Rica" });
    return (
      <p className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        Acceso al portal de HubSpot dado el {fecha}
        {acceso.diasHabiles != null ? ` (${acceso.diasHabiles} ${acceso.diasHabiles === 1 ? "día hábil" : "días hábiles"} desde que el kickoff lo pide)` : ""}.
        <Button size="xs" variant="ghost" loading={guardando} onClick={() => void marcar(false)}>
          Volver a pendiente
        </Button>
      </p>
    );
  }
  if (!acceso.falta) return null;
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
