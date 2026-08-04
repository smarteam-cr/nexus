"use client";

/**
 * Interruptor "proyecto interno de Smarteam", en la configuración del cliente.
 *
 * ── NO ES UNA ETIQUETA: ES SACAR UN PROYECTO DEL DINERO ──────────────────────
 * Marcar interno apaga cuatro cosas —cobranza, cartera del CSE, publicación al cliente y el
 * vigilante— sobre un proyecto que ya está andando. Por eso pide confirmación y la confirmación
 * dice qué pasa, en vez de un "¿estás seguro?" que no informa nada.
 *
 * ── Y NO ESCRIBE EN NEXUS ────────────────────────────────────────────────────
 * El endpoint manda el cambio a HubSpot y trae el espejo. `Project.proyectoInterno` tiene un solo
 * escritor y el sync revertiría cualquier otra cosa en diez minutos. Acá se muestra lo que VOLVIÓ,
 * no lo que se pidió: si HubSpot rechazara el cambio, el interruptor no se mueve.
 */
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";

export default function MarcarInternoToggle({
  projectId,
  projectName,
  interno,
  enHubspot,
  onCambiado,
}: {
  projectId: string;
  projectName: string;
  interno: boolean;
  /** ¿El proyecto ya existe en HubSpot? Sin record allá no hay dónde escribir. */
  enHubspot: boolean;
  onCambiado?: () => void;
}) {
  const [pidiendo, setPidiendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const toast = useToast();

  const destino = !interno;

  async function aplicar() {
    setPidiendo(false);
    setOcupado(true);
    try {
      const r = await fetchJson<{ interno: boolean }>(`/api/projects/${projectId}/interno`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interno: destino }),
      });
      toast.success(
        r.interno
          ? `«${projectName}» quedó como interno: sale de cobranza y de la cartera.`
          : `«${projectName}» vuelve a ser un proyecto de cliente.`,
      );
      onCambiado?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cambiar la marca.");
    } finally {
      setOcupado(false);
    }
  }

  if (!enHubspot) {
    /* Se dice por qué no se puede, en vez de esconder el control: un interruptor ausente se lee
       como "esta función no existe", y acá sí existe — falta terminar el alta. */
    return (
      <span className="text-[11px] text-fg-muted flex-shrink-0" title="El alta todavía no terminó">
        sin registro en HubSpot
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setPidiendo(true)}
        disabled={ocupado}
        className="text-[11px] font-semibold text-brand hover:text-brand-dark disabled:opacity-40 transition-colors flex-shrink-0"
      >
        {interno ? "Ya no es interno" : "Marcar interno"}
      </button>
      <ConfirmDialog
        open={pidiendo}
        onCancel={() => setPidiendo(false)}
        onConfirm={aplicar}
        title={destino ? "Marcar como interno" : "Dejar de ser interno"}
        confirmLabel={destino ? "Sí, es interno" : "Sí, es de cliente"}
        description={
          destino
            ? `«${projectName}» va a salir de Cobranza y de la cartera de su CSE, y no se le va a ` +
              `poder publicar nada al cliente. Se marca en HubSpot, así que el cambio se ve allá también.`
            : `«${projectName}» vuelve a contar para Cobranza y para la cartera, y se le va a poder ` +
              `publicar al cliente. Se marca en HubSpot, así que el cambio se ve allá también.`
        }
      />
    </>
  );
}
