"use client";

/**
 * components/feedback/PedidoDeOpinion.tsx — dirección te pide tu opinión sobre la pantalla en la que estás.
 *
 * Es la respuesta a «la gente no se acuerda»: una pregunta concreta, sobre una pantalla concreta, que
 * aparece cuando la persona entra ahí. Va abajo a la derecha (no se puede meter dentro de cada página) y
 * aparece hasta que la persona responde o dice «Ahora no». Responder abre el panel de Feedback con la
 * pregunta arriba; lo que manda queda atado al pedido.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PedidoParaMi } from "@/lib/feedback/queries";
import { fechaCorta } from "@/lib/feedback/reglas";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { Z } from "@/lib/ui/z";

export function PedidoDeOpinion({ pedido, onResponder, onAhoraNo }: { pedido: PedidoParaMi; onResponder: () => void; onAhoraNo: () => void }) {
  const [montado, setMontado] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard del portal (SSR)
  useEffect(() => setMontado(true), []);

  // Cuántas veces lo vio (una por pedido y por sesión del navegador): ayuda a saber si lo ignoran.
  useEffect(() => {
    const clave = `nexus-feedback-pedido-visto:${pedido.id}`;
    try {
      if (sessionStorage.getItem(clave)) return;
      sessionStorage.setItem(clave, "1");
    } catch {
      /* sin storage: se cuenta igual */
    }
    void fetch(`/api/feedback/pedidos/${pedido.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "visto" }),
    }).catch(() => {});
  }, [pedido.id]);

  const ahoraNo = () => {
    void fetch(`/api/feedback/pedidos/${pedido.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "ahora_no" }),
    }).catch(() => {});
    onAhoraNo();
  };

  if (!montado) return null;
  return createPortal(
    <section
      data-feedback-ui=""
      aria-label="Pedido de opinión"
      className="fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-32px)]"
      style={{ zIndex: Z.DRAWER }}
    >
      <CuerpoDelPedido deQuien={pedido.deQuien} hasta={pedido.hasta} pregunta={pedido.pregunta} onResponder={onResponder} onAhoraNo={ahoraNo} />
    </section>,
    document.body,
  );
}

/**
 * Lo que ve la persona, sin la mecánica (dónde va, cuándo cuenta como visto). Feedback › Encuestas lo usa para mostrar
 * cómo le aparece la pregunta a cada persona antes de mandarla: sin `onResponder`, los botones son de muestra.
 */
export function CuerpoDelPedido({
  deQuien,
  hasta,
  pregunta,
  onResponder,
  onAhoraNo,
}: {
  deQuien: string;
  hasta: string | null;
  pregunta: string;
  onResponder?: () => void;
  onAhoraNo?: () => void;
}) {
  const muestra = !onResponder;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 text-left">
      <p className={ROTULO_DEL_SISTEMA}>
        {deQuien} te pide tu opinión{hasta ? ` · hasta el ${fechaCorta(hasta)}` : ""}
      </p>
      <p className={cn("text-[14.5px] font-semibold leading-[21px]", pregunta ? "text-fg" : "text-fg-muted")}>{pregunta || "Tu pregunta aparece acá"}</p>
      <p className="text-xs text-fg-muted">Un minuto. Le llega con una captura de esta pantalla.</p>
      <div className="mt-1 flex items-center gap-1" aria-hidden={muestra || undefined}>
        <button
          type="button"
          onClick={onResponder}
          tabIndex={muestra ? -1 : undefined}
          className={cn(
            "rounded-lg border border-line bg-surface px-3 py-[7px] text-[13px] font-semibold text-fg-secondary transition-colors",
            muestra ? "cursor-default" : "hover:bg-surface-hover hover:text-fg",
          )}
        >
          Responder
        </button>
        <button
          type="button"
          onClick={onAhoraNo}
          tabIndex={muestra ? -1 : undefined}
          className={cn("rounded px-2 py-[7px] text-[13px] text-fg-muted", muestra ? "cursor-default" : "hover:text-fg")}
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
