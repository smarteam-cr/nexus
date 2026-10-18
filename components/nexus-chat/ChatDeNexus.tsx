"use client";
/**
 * components/nexus-chat/ChatDeNexus.tsx — EL CHAT DE NEXUS en la cabecera de la ficha del cliente (2026-10-17, ficha H).
 *
 * Dos botones:
 *   · «Nexus» abre el cajón de conversación (el MISMO de los otros chats, components/asistente/ChatDelAsistente) sobre esta
 *     cuenta: `base` = /api/nexus-chat/<clientId>. Lo que Nexus propone queda en una lista; «Aplicar» va al SERVIDOR
 *     (`…/aplicar`), que lee la lista del hilo, la vuelve a preparar y la aplica por la capa de operaciones;
 *   · «Sugerencias» abre lo que Nexus le sugiere a esta persona en esta cuenta (sin IA), con el mensaje de WhatsApp listo
 *     para copiar. ⛔ Nexus no envía nada: se copia, o se abre WhatsApp con el texto y lo manda la persona.
 *
 * Un solo panel derecho a la vez: abrir el chat cierra el Feedback, y abrir el Feedback cierra el chat.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AcuerdoDelChat, ResultadoDeAplicar, RotulosDelChat } from "@/components/asistente/ChatDelAsistente";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { usePanelFlotante } from "@/components/ui/usePanelFlotante";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { SkeletonText } from "@/components/ui/Skeleton";
import { zClass } from "@/lib/ui/z";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import { PIEZA_NEXUS } from "@/lib/nexus-chat/constantes";
import { avisoDelChat, textoDelBoton } from "@/lib/nexus-chat/textos";
import type { AccionSugerida } from "@/lib/nexus-chat/acciones";

/* El cajón se carga recién con la primera apertura. */
const ChatDelAsistente = dynamic(() => import("@/components/asistente/ChatDelAsistente"), { ssr: false });

const ROTULOS: RotulosDelChat = {
  alDestino: "a esta cuenta",
  vacio: {
    intro: "Pregúntale lo que Nexus sabe de esta cuenta, o cuéntale lo que pasó. Por ejemplo:",
    cierre: "Lo que propone queda en una lista para revisar. Nada se cambia hasta que lo apliques.",
  },
  boton: (a, desmarcadas) => textoDelBoton((a.operaciones?.length ?? 0) - desmarcadas.size),
};

interface Resumen {
  acciones: AccionSugerida[];
  uso: { linea: string };
}

export function ChatDeNexus({ clientId, nombre }: { clientId: string; nombre: string }) {
  const router = useRouter();
  const feedback = useFeedback();
  const toast = useToast();
  const base = `/api/nexus-chat/${encodeURIComponent(clientId)}`;
  const [montado, setMontado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<{ texto: string; n: number } | null>(null);
  const [pedidoDeFoco, setPedidoDeFoco] = useState(0);
  const [ancho, setAncho] = useState<"normal" | "amplio">("normal");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const { abierto: panelAbierto, alternar: alternarPanel, pos, rootRef, btnRef, panelRef } = usePanelFlotante({ side: "bottom", align: "end", selectorDeItems: "button, a" });

  const cargarResumen = useCallback(async () => {
    const r = await fetch(`${base}/resumen`).catch(() => null);
    if (r?.ok) setResumen((await r.json().catch(() => null)) as Resumen | null);
  }, [base]);

  useEffect(() => {
    let vivo = true;
    fetch(`${base}/resumen`)
      .then((r) => (r.ok ? (r.json() as Promise<Resumen>) : null))
      .then((d) => {
        if (vivo && d) setResumen(d);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [base]);

  const abrir = useCallback(
    (texto?: string) => {
      // Un solo panel derecho a la vez.
      if (feedback?.abierto) feedback.alternar();
      setMontado(true);
      setAbierto(true);
      if (texto) setBorrador((b) => ({ texto, n: (b?.n ?? 0) + 1 }));
      setPedidoDeFoco((n) => n + 1);
      void cargarResumen();
    },
    [feedback, cargarResumen],
  );

  // Y al revés: abrir el Feedback cierra el chat (se mira el cambio durante el render, sin un efecto).
  const feedbackAbierto = feedback?.abierto ?? false;
  const [feedbackAntes, setFeedbackAntes] = useState(feedbackAbierto);
  if (feedbackAbierto !== feedbackAntes) {
    setFeedbackAntes(feedbackAbierto);
    if (feedbackAbierto && abierto) setAbierto(false);
  }

  const onAplicar = useCallback(
    async (_acuerdo: AcuerdoDelChat, de?: { turnoId: string; desmarcadas: readonly number[] }): Promise<ResultadoDeAplicar> => {
      if (!de) return { fallo: "No se pudo identificar la lista: recarga el chat.", avisos: [] };
      const r = await fetch(`${base}/aplicar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(de) }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (!r?.ok) {
        const g = await fetch(`${base}/asistente?pieza=${PIEZA_NEXUS}`).catch(() => null);
        const hilo = g?.ok ? (await g.json().catch(() => null))?.hilo : undefined;
        return { fallo: j?.error ?? "No se pudo aplicar. Prueba de nuevo.", avisos: [], ...(hilo ? { hilo } : {}) };
      }
      router.refresh();
      void cargarResumen();
      return { fallo: null, avisos: [], ...(j.hilo ? { hilo: j.hilo } : {}) };
    },
    [base, router, cargarResumen],
  );

  const copiar = useCallback(
    async (texto: string) => {
      try {
        await navigator.clipboard.writeText(texto);
        toast.success("Mensaje copiado. Pégalo en WhatsApp.");
      } catch {
        toast.error("No se pudo copiar: usa «Abrir WhatsApp».");
      }
    },
    [toast],
  );

  const acciones = resumen?.acciones ?? [];

  return (
    <>
      <div ref={rootRef} className="flex-shrink-0">
        <Button
          ref={btnRef}
          type="button"
          variant="secondary"
          size="xs"
          onClick={alternarPanel}
          aria-expanded={panelAbierto}
          aria-haspopup="dialog"
          title="Lo que Nexus te sugiere en esta cuenta"
          className="gap-1.5 rounded-lg bg-surface text-fg hover:bg-surface-hover"
        >
          <IconoDeSugerencia className="h-3.5 w-3.5 text-brand" />
          Sugerencias
          {acciones.length > 0 && <span className="rounded-full bg-info-surface px-1.5 text-2xs font-semibold text-brand">{acciones.length}</span>}
        </Button>
        {/* ⚠ Sin portal, como los demás paneles de usePanelFlotante (Menu, CeldaSelect, LecturaDeLaCuenta): el hook
            cierra el panel con un clic o un scroll fuera de `rootRef`, y un panel portaleado a document.body quedaría
            «afuera» y se cerraría al scrollearlo por dentro. La capa sí es la de la escala (POPOVER). */}
        {panelAbierto && pos && (
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Lo que Nexus te sugiere"
            className={`fixed ${zClass("POPOVER")} flex max-h-[70vh] w-[380px] max-w-[calc(100vw-24px)] flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-surface p-4 text-[13px] leading-[19px] shadow-xl`}
            style={pos}
          >
            <p className="text-xs font-semibold text-fg">Lo que Nexus te sugiere en {nombre}</p>
            {!resumen ? (
              <div aria-busy="true" aria-label="Cargando las sugerencias" className="flex min-h-[96px] flex-col gap-2 rounded-lg border border-line bg-surface-muted p-2.5">
                <SkeletonText lines={3} />
              </div>
            ) : acciones.length === 0 ? (
              <p className="text-fg-secondary">Nada pendiente de tu lado en esta cuenta. Si pasó algo por WhatsApp o una llamada, cuéntaselo a Nexus.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {acciones.map((a, i) => (
                  <li key={`${a.tipo}-${a.tarea ?? i}`} className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-muted p-2.5">
                    <span className="font-medium text-fg">{a.titulo}</span>
                    <span className="text-xs text-fg-muted">{a.porque}</span>
                    {a.whatsapp && <p className="whitespace-pre-wrap rounded border border-line bg-surface p-2 text-xs text-fg-secondary">{a.whatsapp.texto}</p>}
                    <div className="flex flex-wrap gap-2">
                      {a.whatsapp && (
                        <>
                          <Button type="button" variant="link" size="xs" onClick={() => void copiar(a.whatsapp!.texto)} className="p-0 text-brand">
                            Copiar mensaje
                          </Button>
                          <a href={a.whatsapp.enlace} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand hover:underline">
                            Abrir WhatsApp
                          </a>
                        </>
                      )}
                      {a.pedirAlChat && (
                        <Button
                          type="button"
                          variant="link"
                          size="xs"
                          onClick={() => {
                            alternarPanel();
                            abrir(a.pedirAlChat);
                          }}
                          className="p-0 text-brand"
                        >
                          Pedírselo a Nexus
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-2xs text-fg-muted">Nexus no envía mensajes: los copias y los mandas tú.</p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-expanded={abierto}
        aria-controls="cajon-del-asistente"
        title="Preguntarle a Nexus sobre esta cuenta"
        className={
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors " +
          (abierto ? "border-info-line bg-info-surface text-brand" : "border-line bg-surface text-fg hover:bg-surface-hover")
        }
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
        </svg>
        Nexus
      </button>
      {montado ? (
        <ChatDelAsistente
          base={base}
          pieza={PIEZA_NEXUS}
          piezaLabel={`Nexus · ${nombre}`}
          abierto={abierto}
          onClose={() => setAbierto(false)}
          onAplicar={onAplicar}
          aviso={avisoDelChat(nombre, resumen?.uso.linea ?? null)}
          rotulos={ROTULOS}
          ancho={ancho}
          onAncho={() => setAncho((a) => (a === "amplio" ? "normal" : "amplio"))}
          borrador={borrador}
          pedidoDeFoco={pedidoDeFoco}
        />
      ) : null}
    </>
  );
}
