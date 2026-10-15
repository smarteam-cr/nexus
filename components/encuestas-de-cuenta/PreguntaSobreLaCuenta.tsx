"use client";

/**
 * components/encuestas-de-cuenta/PreguntaSobreLaCuenta.tsx — la pregunta sobre la cuenta, al entrar a un cliente
 * (2026-10-13, pedido de Elías). Abajo a la derecha, como el pedido de opinión de Feedback, y nunca a la vez que él ni
 * con el panel de Feedback abierto; las otras preguntas del rincón van antes (components/ui/turno-de-tarjetas.ts). Qué
 * preguntar y cuándo lo decide el servidor (lib/encuestas-de-cuenta/servidor.ts): acá solo se pinta y se guarda lo que
 * pasó (mostrada · respondida · ahora_no).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { cn } from "@/lib/cn";
import { Z } from "@/lib/ui/z";
import { PRIORIDAD_DE_TARJETA, useTurnoDeTarjeta } from "@/components/ui/turno-de-tarjetas";
import type { PreguntaParaMostrar, ValorDeRespuesta } from "@/lib/encuestas-de-cuenta/preguntas";

/** No apura: la ficha termina de cargar antes de preguntar. */
const ESPERA_MS = 2500;

const ENTRE_PARENTESIS: Record<PreguntaParaMostrar["motivo"], string | null> = {
  nunca: null,
  "no-sabia": "La última vez respondiste «No sé». ¿Ya lo sabes?",
  despues: null,
  "version-nueva": "La pregunta cambió: vuelve a responderla.",
};

export default function PreguntaSobreLaCuenta({ clientId }: { clientId: string }) {
  const feedback = useFeedback();
  const [pregunta, setPregunta] = useState<PreguntaParaMostrar | null>(null);
  const [valor, setValor] = useState<ValorDeRespuesta | null>(null);
  const [porQue, setPorQue] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<ValorDeRespuesta | null>(null);

  useEffect(() => {
    let vivo = true;
    /* eslint-disable react-hooks/set-state-in-effect -- otro cliente: se empieza de cero */
    setPregunta(null);
    setValor(null);
    setPorQue("");
    setListo(null);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = setTimeout(() => {
      fetch(`/api/clients/${clientId}/preguntas-de-la-cuenta`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { pregunta?: PreguntaParaMostrar | null } | null) => {
          if (vivo && d?.pregunta) setPregunta(d.pregunta);
        })
        .catch(() => {});
    }, ESPERA_MS);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [clientId]);

  const tapada = !!feedback?.abierto || !!feedback?.hayPedido;
  const toca = useTurnoDeTarjeta("cuenta", !!pregunta && !tapada, PRIORIDAD_DE_TARJETA.cuenta);

  // Cuántas veces se mostró, una por sesión del navegador: dice si la gente la ve y no la contesta.
  useEffect(() => {
    if (!pregunta || !toca) return;
    const clave = `nexus-pregunta-cuenta:${pregunta.clave}:${pregunta.version}:${clientId}`;
    try {
      if (sessionStorage.getItem(clave)) return;
      sessionStorage.setItem(clave, "1");
    } catch {
      /* sin storage: el servidor no repite una «mostrada» en 12 h */
    }
    void enviar(clientId, { clave: pregunta.clave, evento: "mostrada" });
  }, [pregunta, toca, clientId]);

  // Después de responder, se va sola.
  useEffect(() => {
    if (!listo) return;
    const t = setTimeout(() => setPregunta(null), 3000);
    return () => clearTimeout(t);
  }, [listo]);

  if (!pregunta || !toca || typeof document === "undefined") return null;

  const guardar = async () => {
    if (!valor) return;
    setGuardando(true);
    setError(null);
    const r = await enviar(clientId, {
      clave: pregunta.clave,
      evento: "respondida",
      valor,
      porQue: porQue.trim() || null,
      ruta: window.location.pathname,
    });
    setGuardando(false);
    if (r.ok) setListo(valor);
    else setError(r.error);
  };

  const ahoraNo = () => {
    void enviar(clientId, { clave: pregunta.clave, evento: "ahora_no" });
    setPregunta(null);
  };

  const aclaracion = ENTRE_PARENTESIS[pregunta.motivo];

  return createPortal(
    <section
      aria-label="Pregunta sobre el cliente"
      className="fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-32px)]"
      style={{ zIndex: Z.DRAWER }}
    >
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 text-left">
        <p className={ROTULO_DEL_SISTEMA}>Sobre {pregunta.cliente}</p>
        {listo ? (
          <p className="text-[13px] text-fg-secondary" role="status">
            {listo === "no_se" ? "Listo. Te lo volvemos a preguntar en una semana." : "Gracias. Queda guardado."}
          </p>
        ) : (
          <>
            <p className="text-[14.5px] font-semibold leading-[21px] text-fg">{pregunta.pregunta}</p>
            <p className="text-xs text-fg-muted">{pregunta.descripcion}</p>
            {aclaracion && <p className="text-xs text-fg-secondary">{aclaracion}</p>}
            <div role="radiogroup" aria-label={pregunta.pregunta} className="mt-1 flex gap-1.5">
              {pregunta.respuestas.map((r) => (
                <button
                  key={r.valor}
                  type="button"
                  role="radio"
                  aria-checked={valor === r.valor}
                  onClick={() => setValor(r.valor)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-[7px] text-[13px] font-semibold transition-colors",
                    valor === r.valor
                      ? "border-brand bg-info-surface text-brand"
                      : "border-line bg-surface text-fg-secondary hover:bg-surface-hover hover:text-fg",
                  )}
                >
                  {r.rotulo}
                </button>
              ))}
            </div>
            {valor && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-fg-muted">¿Por qué? (opcional)</span>
                <textarea
                  value={porQue}
                  onChange={(e) => setPorQue(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder={valor === "no_se" ? "Qué te falta para saberlo" : "Lo que te lo dice"}
                  className="resize-none rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
                />
              </label>
            )}
            {error && <p className="text-xs text-danger-ink">{error}</p>}
            <div className="mt-1 flex items-center gap-1">
              <Button variant="primary" size="sm" onClick={guardar} disabled={!valor} loading={guardando}>
                Guardar
              </Button>
              <button type="button" onClick={ahoraNo} className="rounded px-2 py-[7px] text-[13px] text-fg-muted hover:text-fg">
                Ahora no
              </button>
            </div>
          </>
        )}
      </div>
    </section>,
    document.body,
  );
}

async function enviar(clientId: string, cuerpo: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await fetch(`/api/clients/${clientId}/preguntas-de-la-cuenta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (r.ok) return { ok: true };
    const j = await r.json().catch(() => null);
    return { ok: false, error: j?.error ?? "No se pudo guardar. Intenta de nuevo." };
  } catch {
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
}
